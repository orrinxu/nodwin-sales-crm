import { describe, it, expect } from "vitest"
import {
  formatMeetingTimeRange,
  readMeetingMetadata,
  summarizeAttendees,
} from "./meeting-format"

describe("formatMeetingTimeRange", () => {
  it("returns null when there is no start time (fall back to default display)", () => {
    expect(
      formatMeetingTimeRange(
        { startsAt: null, endsAt: null, timeZone: null, allDay: false },
        "us",
      ),
    ).toBeNull()
  })

  it("formats a same-day timed range in a fixed zone", () => {
    const result = formatMeetingTimeRange(
      {
        startsAt: "2026-05-07T14:00:00Z",
        endsAt: "2026-05-07T15:00:00Z",
        timeZone: "UTC",
        allDay: false,
      },
      "us",
    )
    expect(result).toBe("May 7, 2026 · 2:00 PM – 3:00 PM")
  })

  it("uses the meeting's own timeZone over the caller fallback zone", () => {
    // 14:00 UTC is 19:30 in Asia/Kolkata (+5:30).
    const result = formatMeetingTimeRange(
      {
        startsAt: "2026-05-07T14:00:00Z",
        endsAt: "2026-05-07T15:00:00Z",
        timeZone: "Asia/Kolkata",
        allDay: false,
      },
      "us",
      "America/New_York",
    )
    expect(result).toBe("May 7, 2026 · 7:30 PM – 8:30 PM")
  })

  it("labels each end when the meeting spans more than one day", () => {
    const result = formatMeetingTimeRange(
      {
        startsAt: "2026-05-07T22:00:00Z",
        endsAt: "2026-05-08T01:00:00Z",
        timeZone: "UTC",
        allDay: false,
      },
      "us",
    )
    expect(result).toBe("May 7, 2026, 10:00 PM – May 8, 2026, 1:00 AM")
  })

  it("shows an all-day marker for a single all-day meeting", () => {
    const result = formatMeetingTimeRange(
      {
        startsAt: "2026-05-07T00:00:00Z",
        endsAt: "2026-05-08T00:00:00Z",
        timeZone: "UTC",
        allDay: true,
      },
      "us",
    )
    expect(result).toBe("May 7, 2026 · All day")
  })

  it("shows a date range for a multi-day all-day meeting (exclusive end)", () => {
    // May 7-9 inclusive → Google stores end as May 10 (exclusive).
    const result = formatMeetingTimeRange(
      {
        startsAt: "2026-05-07T00:00:00Z",
        endsAt: "2026-05-10T00:00:00Z",
        timeZone: "UTC",
        allDay: true,
      },
      "us",
    )
    expect(result).toBe("May 7, 2026 – May 9, 2026")
  })

  it("handles a start with no end time", () => {
    const result = formatMeetingTimeRange(
      {
        startsAt: "2026-05-07T14:00:00Z",
        endsAt: null,
        timeZone: "UTC",
        allDay: false,
      },
      "us",
    )
    expect(result).toBe("May 7, 2026 · 2:00 PM")
  })

  it("returns null (not 'Invalid Date') for an unparseable start", () => {
    expect(
      formatMeetingTimeRange(
        { startsAt: "not-a-date", endsAt: null, timeZone: null, allDay: false },
        "us",
      ),
    ).toBeNull()
  })
})

describe("readMeetingMetadata", () => {
  it("extracts location, hangoutLink, and attendees", () => {
    const meta = readMeetingMetadata({
      location: "Room 4",
      hangoutLink: "https://meet.example.com/abc",
      attendees: [
        { email: "a@x.com", displayName: "Alice", responseStatus: "accepted" },
        { email: "b@x.com" },
      ],
    })
    expect(meta.location).toBe("Room 4")
    expect(meta.hangoutLink).toBe("https://meet.example.com/abc")
    expect(meta.attendees).toHaveLength(2)
    expect(meta.attendees[0]).toEqual({
      email: "a@x.com",
      displayName: "Alice",
      responseStatus: "accepted",
    })
  })

  it("returns nulls / empty for missing or blank fields", () => {
    const meta = readMeetingMetadata({ location: "   " })
    expect(meta.location).toBeNull()
    expect(meta.hangoutLink).toBeNull()
    expect(meta.attendees).toEqual([])
  })

  it("tolerates junk in the attendees array", () => {
    const meta = readMeetingMetadata({
      attendees: [null, "nope", 42, { displayName: "Only Name" }, {}],
    })
    expect(meta.attendees).toEqual([{ displayName: "Only Name" }])
  })

  it("handles null/undefined metadata", () => {
    expect(readMeetingMetadata(null).attendees).toEqual([])
    expect(readMeetingMetadata(undefined).location).toBeNull()
  })
})

describe("summarizeAttendees", () => {
  it("returns null for no attendees", () => {
    expect(summarizeAttendees([])).toBeNull()
  })

  it("prefers display name, falls back to email", () => {
    expect(
      summarizeAttendees([{ displayName: "Alice" }, { email: "b@x.com" }]),
    ).toBe("Alice, b@x.com")
  })

  it("caps at max and appends a +K more suffix", () => {
    const attendees = [
      { displayName: "A" },
      { displayName: "B" },
      { displayName: "C" },
      { displayName: "D" },
      { displayName: "E" },
    ]
    expect(summarizeAttendees(attendees, 3)).toBe("A, B, C +2 more")
  })
})
