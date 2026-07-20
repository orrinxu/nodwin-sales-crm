// @vitest-environment node
// Runs in the Node runtime (matches route handlers / background jobs), matching prod.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Mock the token-store so no real DB / crypto / network is involved, but keep its
// REAL typed error classes so `instanceof` checks match what the client propagates.
const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }))
vi.mock("./token-store", async () => {
  const actual = await vi.importActual<typeof import("./token-store")>(
    "./token-store",
  )
  return { ...actual, getValidGoogleAccessToken: getTokenMock }
})

// Mock googleapis so nothing hits the network. The mocked OAuth2 records the
// credentials set on it; google.calendar returns a client whose events.list /
// events.get we drive per test.
const {
  listMock,
  getMock,
  insertMock,
  patchMock,
  deleteMock,
  setCredentialsMock,
  oauth2Ctor,
  calendarFactory,
} = vi.hoisted(() => {
  const listMock = vi.fn()
  const getMock = vi.fn()
  const insertMock = vi.fn()
  const patchMock = vi.fn()
  const deleteMock = vi.fn()
  const setCredentialsMock = vi.fn()
  const oauth2Ctor = vi.fn(() => ({ setCredentials: setCredentialsMock }))
  const calendarFactory = vi.fn(() => ({
    events: {
      list: listMock,
      get: getMock,
      insert: insertMock,
      patch: patchMock,
      delete: deleteMock,
    },
  }))
  return {
    listMock,
    getMock,
    insertMock,
    patchMock,
    deleteMock,
    setCredentialsMock,
    oauth2Ctor,
    calendarFactory,
  }
})
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: oauth2Ctor },
    calendar: calendarFactory,
  },
}))

import {
  listEvents,
  getEvent,
  insertEvent,
  updateEvent,
  deleteEvent,
  normalizeEvent,
  CALENDAR_SCOPE,
  CalendarSyncTokenExpiredError,
} from "./calendar-client"

const USER = "user-1"

beforeEach(() => {
  vi.clearAllMocks()
  getTokenMock.mockResolvedValue("ya29.live-token")
})

describe("normalizeEvent (ORR-825)", () => {
  it("normalizes a timed event with attendees, organizer and a hangout link", () => {
    const result = normalizeEvent({
      id: "evt-1",
      iCalUID: "evt-1@google.com",
      summary: "Sync",
      description: "Weekly sync",
      location: "Room 1",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      status: "confirmed",
      updated: "2026-07-20T10:00:00.000Z",
      start: { dateTime: "2026-07-21T09:00:00+05:30", timeZone: "Asia/Kolkata" },
      end: { dateTime: "2026-07-21T10:00:00+05:30", timeZone: "Asia/Kolkata" },
      organizer: { email: "boss@nodwin.com" },
      attendees: [
        { email: "a@nodwin.com", displayName: "A", responseStatus: "accepted" },
        { email: "b@nodwin.com" },
        { displayName: "No Email" }, // dropped — no email
      ],
    })

    expect(result.externalEventId).toBe("evt-1")
    expect(result.iCalUID).toBe("evt-1@google.com")
    expect(result.summary).toBe("Sync")
    expect(result.allDay).toBe(false)
    expect(result.start).toEqual({
      dateTime: "2026-07-21T09:00:00+05:30",
      timeZone: "Asia/Kolkata",
    })
    expect(result.status).toBe("confirmed")
    expect(result.hangoutLink).toBe("https://meet.google.com/abc-defg-hij")
    expect(result.organizerEmail).toBe("boss@nodwin.com")
    expect(result.attendees).toEqual([
      { email: "a@nodwin.com", displayName: "A", responseStatus: "accepted" },
      { email: "b@nodwin.com" },
    ])
    expect(result.updated).toBe("2026-07-20T10:00:00.000Z")
  })

  it("flags all-day events (start.date, no dateTime)", () => {
    const result = normalizeEvent({
      id: "evt-allday",
      status: "confirmed",
      start: { date: "2026-07-21" },
      end: { date: "2026-07-22" },
    })
    expect(result.allDay).toBe(true)
    expect(result.start).toEqual({ date: "2026-07-21" })
    expect(result.end).toEqual({ date: "2026-07-22" })
    expect(result.hangoutLink).toBeNull()
    expect(result.attendees).toEqual([])
  })

  it("normalizes a cancelled event with only sparse fields", () => {
    const result = normalizeEvent({
      id: "evt-gone",
      status: "cancelled",
      updated: "2026-07-20T11:00:00.000Z",
    })
    expect(result.status).toBe("cancelled")
    expect(result.externalEventId).toBe("evt-gone")
    expect(result.summary).toBeNull()
    expect(result.organizerEmail).toBeNull()
    // No start info at all — treated as all-day rather than crashing.
    expect(result.allDay).toBe(true)
  })

  it("falls back to conferenceData video entry point when hangoutLink is absent", () => {
    const result = normalizeEvent({
      id: "evt-conf",
      status: "confirmed",
      start: { dateTime: "2026-07-21T09:00:00Z" },
      end: { dateTime: "2026-07-21T10:00:00Z" },
      conferenceData: {
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+1-555" },
          { entryPointType: "video", uri: "https://meet.google.com/xyz" },
        ],
      },
    })
    expect(result.hangoutLink).toBe("https://meet.google.com/xyz")
  })
})

describe("listEvents (ORR-825)", () => {
  it("requests a token for the calendar scope and credentials the client", async () => {
    listMock.mockResolvedValue({ data: { items: [] } })

    await listEvents({ userId: USER, timeMin: "2026-07-01T00:00:00Z" })

    expect(getTokenMock).toHaveBeenCalledWith(USER, [CALENDAR_SCOPE])
    expect(setCredentialsMock).toHaveBeenCalledWith({
      access_token: "ya29.live-token",
    })
  })

  it("sends the time-windowed shape (timeMin + orderBy, no syncToken) for a full read", async () => {
    listMock.mockResolvedValue({
      data: { items: [], nextPageToken: "pg-2" },
    })

    const result = await listEvents({
      userId: USER,
      timeMin: "2026-07-01T00:00:00Z",
    })

    const arg = listMock.mock.calls[0][0]
    expect(arg).toEqual({
      calendarId: "primary",
      timeMin: "2026-07-01T00:00:00Z",
      pageToken: undefined,
      maxResults: 250,
      singleEvents: true,
      showDeleted: true,
      orderBy: "startTime",
    })
    expect(arg.syncToken).toBeUndefined()
    expect(result.nextPageToken).toBe("pg-2")
  })

  it("sends ONLY sync-safe params (no timeMin / orderBy) when a syncToken is given", async () => {
    listMock.mockResolvedValue({
      data: {
        items: [
          {
            id: "evt-9",
            status: "confirmed",
            start: { dateTime: "2026-07-21T09:00:00Z" },
            end: { dateTime: "2026-07-21T10:00:00Z" },
          },
        ],
        nextSyncToken: "sync-next",
      },
    })

    const result = await listEvents({
      userId: USER,
      calendarId: "team@group.calendar.google.com",
      syncToken: "sync-abc",
      // timeMin is ignored when a syncToken is present.
      timeMin: "2026-07-01T00:00:00Z",
    })

    const arg = listMock.mock.calls[0][0]
    expect(arg).toEqual({
      calendarId: "team@group.calendar.google.com",
      syncToken: "sync-abc",
      pageToken: undefined,
      maxResults: 250,
      singleEvents: true,
      showDeleted: true,
    })
    expect(arg.timeMin).toBeUndefined()
    expect(arg.orderBy).toBeUndefined()
    expect(result.events).toHaveLength(1)
    expect(result.events[0].externalEventId).toBe("evt-9")
    expect(result.nextSyncToken).toBe("sync-next")
  })

  it("throws CalendarSyncTokenExpiredError on a 410 (err.code)", async () => {
    listMock.mockRejectedValue(Object.assign(new Error("Gone"), { code: 410 }))

    await expect(
      listEvents({ userId: USER, syncToken: "stale" }),
    ).rejects.toBeInstanceOf(CalendarSyncTokenExpiredError)
  })

  it("throws CalendarSyncTokenExpiredError on a 410 (err.response.status)", async () => {
    listMock.mockRejectedValue(
      Object.assign(new Error("Gone"), { response: { status: 410 } }),
    )

    await expect(
      listEvents({ userId: USER, syncToken: "stale" }),
    ).rejects.toBeInstanceOf(CalendarSyncTokenExpiredError)
  })

  it("propagates non-410 API errors unchanged", async () => {
    const err = Object.assign(new Error("boom"), { code: 500 })
    listMock.mockRejectedValue(err)

    await expect(
      listEvents({ userId: USER, timeMin: "2026-07-01T00:00:00Z" }),
    ).rejects.toBe(err)
  })

  it("propagates token-store errors unchanged (no calendar call)", async () => {
    const { GoogleScopeMissingError } = await vi.importActual<
      typeof import("./token-store")
    >("./token-store")
    getTokenMock.mockRejectedValue(new GoogleScopeMissingError([CALENDAR_SCOPE]))

    await expect(
      listEvents({ userId: USER, timeMin: "2026-07-01T00:00:00Z" }),
    ).rejects.toBeInstanceOf(GoogleScopeMissingError)
    expect(listMock).not.toHaveBeenCalled()
  })
})

describe("getEvent (ORR-825)", () => {
  it("fetches a single event by id and normalizes it", async () => {
    getMock.mockResolvedValue({
      data: {
        id: "evt-single",
        status: "tentative",
        start: { dateTime: "2026-07-21T09:00:00Z" },
        end: { dateTime: "2026-07-21T10:00:00Z" },
      },
    })

    const result = await getEvent({ userId: USER, eventId: "evt-single" })

    expect(getMock).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "evt-single",
    })
    expect(result.externalEventId).toBe("evt-single")
    expect(result.status).toBe("tentative")
  })
})

describe("insertEvent (ORR-829)", () => {
  it("requests a token for the calendar scope and credentials the client", async () => {
    insertMock.mockResolvedValue({ data: { id: "evt-new" } })

    await insertEvent({
      userId: USER,
      event: {
        start: { dateTime: "2026-07-21T09:00:00Z", timeZone: "Asia/Kolkata" },
        end: { dateTime: "2026-07-21T10:00:00Z", timeZone: "Asia/Kolkata" },
      },
    })

    expect(getTokenMock).toHaveBeenCalledWith(USER, [CALENDAR_SCOPE])
    expect(setCredentialsMock).toHaveBeenCalledWith({
      access_token: "ya29.live-token",
    })
  })

  it("builds a timed-event body (dropping absent fields) and returns id + hangoutLink", async () => {
    insertMock.mockResolvedValue({
      data: { id: "evt-new", hangoutLink: "https://meet.google.com/xyz" },
    })

    const result = await insertEvent({
      userId: USER,
      event: {
        summary: "Kickoff",
        description: "Project kickoff",
        location: "Room 2",
        start: { dateTime: "2026-07-21T09:00:00Z", timeZone: "Asia/Kolkata" },
        end: { dateTime: "2026-07-21T10:00:00Z", timeZone: "Asia/Kolkata" },
        attendees: [{ email: "a@nodwin.com" }, { email: "b@nodwin.com" }],
      },
    })

    const arg = insertMock.mock.calls[0][0]
    expect(arg.calendarId).toBe("primary")
    expect(arg.requestBody).toEqual({
      summary: "Kickoff",
      description: "Project kickoff",
      location: "Room 2",
      start: { dateTime: "2026-07-21T09:00:00Z", timeZone: "Asia/Kolkata" },
      end: { dateTime: "2026-07-21T10:00:00Z", timeZone: "Asia/Kolkata" },
      attendees: [{ email: "a@nodwin.com" }, { email: "b@nodwin.com" }],
    })
    expect(result).toEqual({
      eventId: "evt-new",
      hangoutLink: "https://meet.google.com/xyz",
    })
  })

  it("omits summary/description/location/attendees when not provided (all-day)", async () => {
    insertMock.mockResolvedValue({ data: { id: "evt-allday" } })

    const result = await insertEvent({
      userId: USER,
      calendarId: "team@group.calendar.google.com",
      event: {
        start: { date: "2026-07-21" },
        end: { date: "2026-07-22" },
      },
    })

    const arg = insertMock.mock.calls[0][0]
    expect(arg.calendarId).toBe("team@group.calendar.google.com")
    expect(arg.requestBody).toEqual({
      start: { date: "2026-07-21" },
      end: { date: "2026-07-22" },
    })
    expect(arg.requestBody.summary).toBeUndefined()
    expect(arg.requestBody.attendees).toBeUndefined()
    expect(result).toEqual({ eventId: "evt-allday", hangoutLink: null })
  })

  it("throws when Google returns no event id", async () => {
    insertMock.mockResolvedValue({ data: {} })

    await expect(
      insertEvent({
        userId: USER,
        event: {
          start: { dateTime: "2026-07-21T09:00:00Z" },
          end: { dateTime: "2026-07-21T10:00:00Z" },
        },
      }),
    ).rejects.toThrow(/no event id/i)
  })

  it("propagates token-store errors unchanged (no insert call)", async () => {
    const { GoogleScopeMissingError } = await vi.importActual<
      typeof import("./token-store")
    >("./token-store")
    getTokenMock.mockRejectedValue(new GoogleScopeMissingError([CALENDAR_SCOPE]))

    await expect(
      insertEvent({
        userId: USER,
        event: {
          start: { dateTime: "2026-07-21T09:00:00Z" },
          end: { dateTime: "2026-07-21T10:00:00Z" },
        },
      }),
    ).rejects.toBeInstanceOf(GoogleScopeMissingError)
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe("updateEvent / deleteEvent (ORR-829)", () => {
  it("patches an event by id and returns it normalized", async () => {
    patchMock.mockResolvedValue({
      data: {
        id: "evt-x",
        status: "confirmed",
        summary: "Renamed",
        start: { dateTime: "2026-07-21T09:00:00Z" },
        end: { dateTime: "2026-07-21T10:00:00Z" },
      },
    })

    const result = await updateEvent({
      userId: USER,
      eventId: "evt-x",
      event: {
        summary: "Renamed",
        start: { dateTime: "2026-07-21T09:00:00Z" },
        end: { dateTime: "2026-07-21T10:00:00Z" },
      },
    })

    expect(patchMock.mock.calls[0][0].eventId).toBe("evt-x")
    expect(result.summary).toBe("Renamed")
  })

  it("deletes an event by id", async () => {
    deleteMock.mockResolvedValue({})

    await deleteEvent({ userId: USER, eventId: "evt-x" })

    expect(deleteMock).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "evt-x",
    })
  })
})
