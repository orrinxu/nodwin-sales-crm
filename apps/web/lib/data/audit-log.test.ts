import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let auditRows: unknown[] = []
let userRows: unknown[] = []

function builder(rows: unknown[]) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "order", "range", "eq", "gte", "lte", "in"]) {
    // eslint-disable-next-line security/detect-object-injection -- m iterates a fixed method list
    b[m] = () => b
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
  return b
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: (table: string) => builder(table === "users" ? userRows : auditRows),
    rpc: vi.fn(async () => ({ data: [{ table_name: "opportunities" }], error: null })),
  })),
}))

import { getAuditLog, getAuditTableNames } from "./audit-log"

const ctx = { user: { id: "admin-1", email: "a@nodwin.com", role: "admin" }, source: "web" as const }

function row(over: Record<string, unknown> = {}) {
  return {
    id: "e1", table_name: "ai_providers", row_id: "r1", operation: "UPDATE",
    changed_fields: { api_key: "sk-SECRET", model: "claude" },
    old_data: { api_key: "sk-OLD", model: "gemini" },
    new_data: { api_key: "sk-SECRET", model: "claude" },
    actor_user_id: "u1", actor_source: "user", actor_ip: "1.2.3.4",
    occurred_at: "2026-07-14T10:00:00Z", ...over,
  }
}

beforeEach(() => {
  auditRows = []
  userRows = []
})

describe("getAuditLog", () => {
  it("redacts credential columns from changed/old/new data (defense in depth)", async () => {
    auditRows = [row()]
    const { entries } = await getAuditLog(ctx)
    expect(entries[0].newData).toEqual({ api_key: "[redacted]", model: "claude" })
    expect(entries[0].oldData).toEqual({ api_key: "[redacted]", model: "gemini" })
    expect(entries[0].changedFields).toEqual({ api_key: "[redacted]", model: "claude" })
  })

  it("resolves the actor's display name", async () => {
    auditRows = [row()]
    userRows = [{ id: "u1", full_name: "Ada Admin" }]
    const { entries } = await getAuditLog(ctx)
    expect(entries[0].actorName).toBe("Ada Admin")
  })

  it("falls back to null actor name and keeps actor_source", async () => {
    auditRows = [row({ actor_user_id: null, actor_source: "system" })]
    const { entries } = await getAuditLog(ctx)
    expect(entries[0].actorName).toBeNull()
    expect(entries[0].actorSource).toBe("system")
  })

  it("sets hasMore and trims to the page size when an extra row is returned", async () => {
    auditRows = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]
    const { entries, hasMore } = await getAuditLog(ctx, { limit: 2 })
    expect(hasMore).toBe(true)
    expect(entries.map((e) => e.id)).toEqual(["a", "b"])
  })

  it("reports no next page when the rows fit the limit", async () => {
    auditRows = [row({ id: "a" }), row({ id: "b" })]
    const { hasMore } = await getAuditLog(ctx, { limit: 2 })
    expect(hasMore).toBe(false)
  })
})

describe("getAuditTableNames", () => {
  it("returns the distinct table names from the RPC", async () => {
    expect(await getAuditTableNames(ctx)).toEqual(["opportunities"])
  })
})
