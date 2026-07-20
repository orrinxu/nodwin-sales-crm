// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Keep the REAL CALENDAR_SCOPE constant (the pre-flight scope check uses it) but
// stub insertEvent so no network / googleapis is involved.
const { insertEventMock } = vi.hoisted(() => ({ insertEventMock: vi.fn() }))
vi.mock("@/lib/integrations/google/calendar-client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/integrations/google/calendar-client")
    >()
  return { ...actual, insertEvent: insertEventMock }
})

const { getConnectionMock } = vi.hoisted(() => ({ getConnectionMock: vi.fn() }))
vi.mock("@/lib/integrations/google/token-store", () => ({
  getGoogleConnection: getConnectionMock,
}))

// A chainable Supabase stub: `.from(..).update(..).eq(..)` resolves to a result,
// capturing the update payload for assertions.
const updateResult = { error: null as { message: string } | null }
const eqMock = vi.fn(async () => updateResult)
const updateMock = vi.fn((_payload: Record<string, unknown>) => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ update: updateMock }))
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}))

import { pushMeetingToGoogle } from "./push"
import { CALENDAR_SCOPE } from "@/lib/integrations/google/calendar-client"
import type {
  ActivityCallContext,
  ActivityRecord,
} from "@/lib/data/activities"

const ctx: ActivityCallContext = {
  user: { id: "user-1", email: "u@nodwin.com", role: "sales" } as never,
  source: "web",
}

function meeting(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: "act-1",
    opportunityId: "opp-1",
    opportunityName: null,
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    userId: "user-1",
    userName: null,
    type: "meeting",
    externalThreadId: null,
    subject: "Kickoff",
    body: "Agenda",
    startsAt: "2026-07-21T09:00:00.000Z",
    endsAt: "2026-07-21T10:00:00.000Z",
    timeZone: "Asia/Kolkata",
    allDay: false,
    externalEventId: null,
    metadata: { location: "Room 2", attendees: [{ email: "a@nodwin.com" }] },
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  updateResult.error = null
})

describe("pushMeetingToGoogle — not connected (ORR-829)", () => {
  it("skips (no throw) when there is no Google connection", async () => {
    getConnectionMock.mockResolvedValue(null)

    const result = await pushMeetingToGoogle(ctx, meeting())

    expect(result).toEqual({ pushed: false, reason: "not_connected" })
    expect(insertEventMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("skips when connected but the calendar.events scope is not granted", async () => {
    getConnectionMock.mockResolvedValue({
      connected: true,
      grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      status: "connected",
      googleAccountEmail: "u@nodwin.com",
      accessTokenExpiresAt: null,
    })

    const result = await pushMeetingToGoogle(ctx, meeting())

    expect(result.pushed).toBe(false)
    expect(result.reason).toBe("not_connected")
    expect(insertEventMock).not.toHaveBeenCalled()
  })
})

describe("pushMeetingToGoogle — connected (ORR-829)", () => {
  beforeEach(() => {
    getConnectionMock.mockResolvedValue({
      connected: true,
      grantedScopes: [CALENDAR_SCOPE],
      status: "connected",
      googleAccountEmail: "u@nodwin.com",
      accessTokenExpiresAt: null,
    })
  })

  it("inserts the event and writes external_event_id + metadata.source='crm'", async () => {
    insertEventMock.mockResolvedValue({
      eventId: "g-evt-1",
      hangoutLink: "https://meet.google.com/abc",
    })

    const result = await pushMeetingToGoogle(ctx, meeting())

    // Insert built from the activity fields (timed event).
    const insertArg = insertEventMock.mock.calls[0][0]
    expect(insertArg.userId).toBe("user-1")
    expect(insertArg.event).toEqual({
      summary: "Kickoff",
      description: "Agenda",
      location: "Room 2",
      start: { dateTime: "2026-07-21T09:00:00.000Z", timeZone: "Asia/Kolkata" },
      end: { dateTime: "2026-07-21T10:00:00.000Z", timeZone: "Asia/Kolkata" },
      attendees: [{ email: "a@nodwin.com" }],
    })

    // Echo-loop guard: external_event_id + source:'crm' persisted on the row.
    const updatePayload = updateMock.mock.calls[0][0]
    expect(updatePayload.external_event_id).toBe("g-evt-1")
    expect(updatePayload.metadata).toMatchObject({
      source: "crm",
      location: "Room 2",
      hangoutLink: "https://meet.google.com/abc",
    })
    expect(eqMock).toHaveBeenCalledWith("id", "act-1")

    expect(result).toEqual({
      pushed: true,
      externalEventId: "g-evt-1",
      hangoutLink: "https://meet.google.com/abc",
    })
  })

  it("emits an all-day date (no dateTime) for all-day meetings", async () => {
    insertEventMock.mockResolvedValue({ eventId: "g-evt-2", hangoutLink: null })

    await pushMeetingToGoogle(
      ctx,
      meeting({
        allDay: true,
        timeZone: null,
        startsAt: "2026-07-21T00:00:00.000Z",
        endsAt: "2026-07-22T00:00:00.000Z",
      }),
    )

    const insertArg = insertEventMock.mock.calls[0][0]
    expect(insertArg.event.start).toEqual({ date: "2026-07-21" })
    expect(insertArg.event.end).toEqual({ date: "2026-07-22" })
  })

  it("returns a soft failure (never throws) when insert throws", async () => {
    insertEventMock.mockRejectedValue(new Error("Google 500"))

    const result = await pushMeetingToGoogle(ctx, meeting())

    expect(result.pushed).toBe(false)
    expect(result.reason).toContain("Google 500")
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("returns a soft failure when persisting the event id fails", async () => {
    insertEventMock.mockResolvedValue({ eventId: "g-evt-3", hangoutLink: null })
    updateResult.error = { message: "rls denied" }

    const result = await pushMeetingToGoogle(ctx, meeting())

    expect(result.pushed).toBe(false)
    expect(result.reason).toContain("persist_failed")
  })
})
