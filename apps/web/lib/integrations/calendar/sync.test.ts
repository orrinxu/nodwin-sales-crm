import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NormalizedCalendarEvent } from "@/lib/integrations/google/calendar-client"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}))

// vi.mock factories are hoisted above const declarations, so the mock fns must
// be created via vi.hoisted to exist when the factories run.
const { mockSendAdminAlert, mockListEvents } = vi.hoisted(() => ({
  mockSendAdminAlert: vi.fn(() => Promise.resolve("alert-id")),
  mockListEvents: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock("@/lib/notifications/admin-alerts", () => ({
  sendAdminAlert: mockSendAdminAlert,
}))

// Keep the real CalendarSyncTokenExpiredError (needed for instanceof) but stub
// listEvents so no network happens.
vi.mock("@/lib/integrations/google/calendar-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/integrations/google/calendar-client")>()
  return {
    ...actual,
    listEvents: mockListEvents,
  }
})

// A single shared fake DB; the @supabase/ssr createServerClient returns it.
let db: FakeDb
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => db),
}))

import { runCalendarSyncForUser } from "./sync"

// ---------------------------------------------------------------------------
// Fake Supabase client
// ---------------------------------------------------------------------------

interface DbConfig {
  syncState?: Record<string, unknown> | null
  accounts?: { id: string }[]
  contacts?: { id: string; email?: string }[]
  upsertError?: string | null
}

interface Recorded {
  upserts: Array<{ row: Record<string, unknown>; opts: unknown }>
  deletes: Array<{ filters: Array<[string, unknown]> }>
  stateUpdates: Array<Record<string, unknown>>
  deadletters: Array<Record<string, unknown>>
}

interface FakeDb {
  from: (table: string) => Record<string, unknown>
  recorded: Recorded
}

function makeDb(cfg: DbConfig): FakeDb {
  const recorded: Recorded = {
    upserts: [],
    deletes: [],
    stateUpdates: [],
    deadletters: [],
  }

  function from(table: string) {
    const state: {
      op: "select" | "update" | "insert" | "upsert" | "delete"
      payload?: Record<string, unknown>
      opts?: unknown
      eqs: Array<[string, unknown]>
    } = { op: "select", eqs: [] }

    const resolve = () => {
      if (table === "google_calendar_sync_state") {
        if (state.op === "update") {
          recorded.stateUpdates.push(state.payload ?? {})
          return { data: null, error: null }
        }
        return { data: cfg.syncState ?? null, error: null }
      }
      if (table === "activities") {
        if (state.op === "upsert") {
          recorded.upserts.push({ row: state.payload ?? {}, opts: state.opts })
          return {
            data: null,
            error: cfg.upsertError ? { message: cfg.upsertError } : null,
          }
        }
        if (state.op === "delete") {
          recorded.deletes.push({ filters: state.eqs })
          return { data: null, error: null }
        }
        return { data: null, error: null }
      }
      if (table === "accounts") {
        return { data: cfg.accounts ?? [], error: null }
      }
      if (table === "contacts") {
        return { data: cfg.contacts ?? [], error: null }
      }
      if (table === "inbound_email_deadletter") {
        if (state.op === "insert") {
          recorded.deadletters.push(state.payload ?? {})
          return { data: { id: "dl-1" }, error: null }
        }
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }

    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.in = chain
    b.or = chain
    b.overlaps = chain
    b.contains = chain
    b.limit = chain
    b.eq = (col: string, val: unknown) => {
      state.eqs.push([col, val])
      return b
    }
    b.update = (p: Record<string, unknown>) => {
      state.op = "update"
      state.payload = p
      return b
    }
    b.insert = (p: Record<string, unknown>) => {
      state.op = "insert"
      state.payload = p
      return b
    }
    b.upsert = (p: Record<string, unknown>, opts: unknown) => {
      state.op = "upsert"
      state.payload = p
      state.opts = opts
      return b
    }
    b.delete = () => {
      state.op = "delete"
      return b
    }
    b.maybeSingle = () => Promise.resolve(resolve())
    b.single = () => Promise.resolve(resolve())
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(res, rej)
    return b
  }

  return { from, recorded }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = "user-1"

function enabledState(over: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    calendar_id: "primary",
    sync_enabled: true,
    sync_token: null,
    status: "idle",
    ...over,
  }
}

function event(over: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    externalEventId: "evt-1",
    iCalUID: "ical-1",
    summary: "Sync with Acme",
    description: "Quarterly review",
    location: "Zoom",
    hangoutLink: "https://meet.google.com/abc",
    start: { dateTime: "2026-07-20T10:00:00Z", timeZone: "UTC" },
    end: { dateTime: "2026-07-20T11:00:00Z", timeZone: "UTC" },
    allDay: false,
    status: "confirmed",
    attendees: [{ email: "buyer@acme.com" }],
    organizerEmail: "rep@nodwin.com",
    updated: "2026-07-19T00:00:00Z",
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runCalendarSyncForUser (ORR-826)", () => {
  it("maps an event to a meeting activity upserted on external_event_id", async () => {
    db = makeDb({ syncState: enabledState(), accounts: [{ id: "acc-1" }], contacts: [{ id: "con-1", email: "buyer@acme.com" }] })
    mockListEvents.mockResolvedValueOnce({ events: [event()], nextSyncToken: "tok-1" })

    const res = await runCalendarSyncForUser(USER)

    expect(res).toEqual({ upserted: 1, removed: 0 })
    expect(db.recorded.upserts).toHaveLength(1)
    const { row, opts } = db.recorded.upserts[0]
    expect(opts).toEqual({ onConflict: "external_event_id" })
    expect(row).toMatchObject({
      user_id: USER,
      type: "meeting",
      external_event_id: "evt-1",
      starts_at: "2026-07-20T10:00:00Z",
      ends_at: "2026-07-20T11:00:00Z",
      time_zone: "UTC",
      all_day: false,
      subject: "Sync with Acme",
      body: "Quarterly review",
      account_id: "acc-1",
      contact_id: "con-1",
      opportunity_id: null,
    })
    expect(row.metadata).toMatchObject({
      location: "Zoom",
      hangoutLink: "https://meet.google.com/abc",
      organizerEmail: "rep@nodwin.com",
      source: "calendar",
    })
    // Persisted the fresh token + idle status.
    const finalUpdate = db.recorded.stateUpdates.at(-1)
    expect(finalUpdate).toMatchObject({ sync_token: "tok-1", status: "idle" })
  })

  it("is idempotent across re-runs (same conflict key, no duplicate rows)", async () => {
    db = makeDb({ syncState: enabledState(), accounts: [{ id: "acc-1" }], contacts: [] })
    mockListEvents.mockResolvedValue({ events: [event()], nextSyncToken: "tok-1" })

    await runCalendarSyncForUser(USER)
    const firstKey = db.recorded.upserts[0].row.external_event_id

    db.recorded.upserts.length = 0
    await runCalendarSyncForUser(USER)
    const secondKey = db.recorded.upserts[0].row.external_event_id

    expect(firstKey).toBe(secondKey)
    expect(db.recorded.upserts[0].opts).toEqual({ onConflict: "external_event_id" })
  })

  it("removes the mirrored activity for a cancelled event", async () => {
    db = makeDb({ syncState: enabledState() })
    mockListEvents.mockResolvedValueOnce({
      events: [event({ status: "cancelled" })],
      nextSyncToken: "tok-2",
    })

    const res = await runCalendarSyncForUser(USER)

    expect(res).toEqual({ upserted: 0, removed: 1 })
    expect(db.recorded.upserts).toHaveLength(0)
    expect(db.recorded.deletes).toHaveLength(1)
    expect(db.recorded.deletes[0].filters).toEqual(
      expect.arrayContaining([
        ["external_event_id", "evt-1"],
        ["user_id", USER],
      ]),
    )
  })

  it("drops a stale sync token and does one full resync on 410", async () => {
    const { CalendarSyncTokenExpiredError } = await import(
      "@/lib/integrations/google/calendar-client"
    )
    db = makeDb({ syncState: enabledState({ sync_token: "stale" }), accounts: [], contacts: [] })
    mockListEvents
      .mockRejectedValueOnce(new CalendarSyncTokenExpiredError())
      .mockResolvedValueOnce({ events: [event()], nextSyncToken: "fresh" })

    const res = await runCalendarSyncForUser(USER)

    expect(res.upserted).toBe(1)
    // First call carried the stale token; the resync omitted it (bootstrap window).
    expect(mockListEvents).toHaveBeenCalledTimes(2)
    expect(mockListEvents.mock.calls[0][0]).toMatchObject({ syncToken: "stale" })
    const resyncArg = mockListEvents.mock.calls[1][0] as {
      syncToken?: string
      timeMin?: string
    }
    expect(resyncArg.syncToken).toBeUndefined()
    expect(resyncArg.timeMin).toEqual(expect.any(String))
  })

  it("sets account_id on a single domain match and leaves it null when ambiguous", async () => {
    // Single match → account set.
    db = makeDb({ syncState: enabledState(), accounts: [{ id: "acc-1" }], contacts: [] })
    mockListEvents.mockResolvedValueOnce({ events: [event()], nextSyncToken: "t" })
    await runCalendarSyncForUser(USER)
    expect(db.recorded.upserts[0].row.account_id).toBe("acc-1")

    // Ambiguous (>1) → null.
    db = makeDb({
      syncState: enabledState(),
      accounts: [{ id: "acc-1" }, { id: "acc-2" }],
      contacts: [],
    })
    mockListEvents.mockResolvedValueOnce({ events: [event()], nextSyncToken: "t" })
    await runCalendarSyncForUser(USER)
    expect(db.recorded.upserts[0].row.account_id).toBeNull()
  })

  it("skips a user whose sync is disabled", async () => {
    db = makeDb({ syncState: enabledState({ sync_enabled: false }) })

    const res = await runCalendarSyncForUser(USER)

    expect(res).toEqual({ skipped: true, upserted: 0, removed: 0 })
    expect(mockListEvents).not.toHaveBeenCalled()
    expect(db.recorded.upserts).toHaveLength(0)
  })

  it("skips a user with no sync-state row", async () => {
    db = makeDb({ syncState: null })

    const res = await runCalendarSyncForUser(USER)

    expect(res).toEqual({ skipped: true, upserted: 0, removed: 0 })
    expect(mockListEvents).not.toHaveBeenCalled()
  })

  it("records status=error + dead-letter + admin alert on failure", async () => {
    db = makeDb({ syncState: enabledState() })
    mockListEvents.mockRejectedValueOnce(new Error("boom"))

    await expect(runCalendarSyncForUser(USER)).rejects.toThrow("boom")

    const errorUpdate = db.recorded.stateUpdates.find((u) => u.status === "error")
    expect(errorUpdate).toMatchObject({ status: "error", last_error: "boom" })
    expect(db.recorded.deadletters).toHaveLength(1)
    expect(mockSendAdminAlert).toHaveBeenCalledOnce()
  })
})
