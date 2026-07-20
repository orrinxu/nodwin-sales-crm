import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const SECRET = "test-calendar-cron-secret"

// Mutable secret holder so tests can flip "configured" vs "unset" without
// resetting the module graph. The route reads env at request time.
const h = vi.hoisted(() => ({ secret: undefined as string | undefined }))

vi.mock("@/lib/security/env", () => ({
  env: {
    get CALENDAR_SYNC_CRON_SECRET() {
      return h.secret
    },
  },
}))

vi.mock("@/lib/integrations/google/calendar-client", () => ({
  CALENDAR_SCOPE: "https://www.googleapis.com/auth/calendar.events",
}))

const mockRunSync = vi.fn()
vi.mock("@/lib/integrations/calendar/sync", () => ({
  runCalendarSyncForUser: (...args: unknown[]) => mockRunSync(...args),
}))

let db: FakeDb
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => db,
}))

import { POST } from "./route"

// ---------------------------------------------------------------------------
// Fake DB for user-iteration + cron audit
// ---------------------------------------------------------------------------

interface DbConfig {
  enabled?: { user_id: string }[]
  connected?: { user_id: string }[]
}

interface FakeDb {
  from: (table: string) => Record<string, unknown>
  cronInserts: Record<string, unknown>[]
}

function makeDb(cfg: DbConfig): FakeDb {
  const cronInserts: Record<string, unknown>[] = []

  function from(table: string) {
    const state: { op: string; payload?: Record<string, unknown> } = { op: "select" }
    const resolve = () => {
      if (table === "google_calendar_sync_state") {
        return { data: cfg.enabled ?? [], error: null }
      }
      if (table === "google_oauth_connections") {
        return { data: cfg.connected ?? [], error: null }
      }
      if (table === "cron_job_runs" && state.op === "insert") {
        cronInserts.push(state.payload ?? {})
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }

    const b: Record<string, unknown> = {}
    const chain = () => b
    b.select = chain
    b.eq = chain
    b.in = chain
    b.contains = chain
    b.limit = chain
    b.insert = (p: Record<string, unknown>) => {
      state.op = "insert"
      state.payload = p
      return b
    }
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(res, rej)
    return b
  }

  return { from, cronInserts }
}

function postRequest(url: string, headerValue?: string): NextRequest {
  const headers = new Headers()
  if (headerValue != null) headers.set("authorization", `Bearer ${headerValue}`)
  return new Request(url, { method: "POST", headers }) as unknown as NextRequest
}

const URL_BASE = "https://crm.nodwin.com/api/jobs/calendar-sync"

beforeEach(() => {
  vi.clearAllMocks()
  h.secret = SECRET
  db = makeDb({})
})

describe("POST /api/jobs/calendar-sync (ORR-826)", () => {
  it("503s when the cron secret is unset", async () => {
    h.secret = undefined
    const res = await POST(postRequest(URL_BASE, SECRET))
    expect(res.status).toBe(503)
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it("401s on a secret mismatch", async () => {
    const res = await POST(postRequest(URL_BASE, "wrong-secret"))
    expect(res.status).toBe(401)
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it("401s when no secret is provided", async () => {
    const res = await POST(postRequest(URL_BASE))
    expect(res.status).toBe(401)
  })

  it("syncs a single user when ?userId= is given", async () => {
    mockRunSync.mockResolvedValue({ upserted: 3, removed: 1 })
    const res = await POST(postRequest(`${URL_BASE}?userId=user-9`, SECRET))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, upserted: 3, removed: 1, failed: 0 })
    expect(mockRunSync).toHaveBeenCalledOnce()
    expect(mockRunSync).toHaveBeenCalledWith("user-9")
    expect(db.cronInserts).toHaveLength(1)
    expect(db.cronInserts[0]).toMatchObject({ job_name: "calendar_sync_drain", status: "ok" })
  })

  it("iterates sync-enabled + connected users and aggregates the summary", async () => {
    db = makeDb({
      enabled: [{ user_id: "u1" }, { user_id: "u2" }],
      connected: [{ user_id: "u1" }, { user_id: "u2" }],
    })
    mockRunSync
      .mockResolvedValueOnce({ upserted: 2, removed: 0 })
      .mockResolvedValueOnce({ skipped: true, upserted: 0, removed: 0 })

    const res = await POST(postRequest(URL_BASE, SECRET))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ processed: 2, upserted: 2, removed: 0, skipped: 1 })
    expect(mockRunSync).toHaveBeenCalledTimes(2)
  })

  it("records a per-user failure without aborting the batch", async () => {
    db = makeDb({ enabled: [{ user_id: "u1" }], connected: [{ user_id: "u1" }] })
    mockRunSync.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(postRequest(URL_BASE, SECRET))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ processed: 1, failed: 1 })
    expect(db.cronInserts[0]).toMatchObject({ status: "error" })
  })
})
