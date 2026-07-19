import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const insertSpy = vi.fn()
const updateSpy = vi.fn()
const mockFrom = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// A chainable builder whose terminal (.maybeSingle / .single / thenable) resolves
// to `resolveData`. insert/update are spied so we can assert the NULL-entity
// upsert takes the natural-key UPDATE path rather than inserting a duplicate.
function makeBuilder(resolveData: unknown) {
  const b: Record<string, unknown> = {}
  const self = () => b
  b.select = self
  b.eq = self
  b.is = self
  b.order = self
  b.insert = (payload: unknown) => {
    insertSpy(payload)
    return b
  }
  b.update = (payload: unknown) => {
    updateSpy(payload)
    return b
  }
  b.maybeSingle = () => Promise.resolve({ data: resolveData, error: null })
  b.single = () => Promise.resolve({ data: resolveData, error: null })
  b.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    resolve({ data: resolveData, error: null })
  return b
}

const ctx = {
  user: { id: "admin-1", email: "admin@example.com", role: "admin" },
  source: "web" as const,
}

function queueResults(results: unknown[]) {
  let idx = 0
  mockFrom.mockImplementation(() => makeBuilder(results[idx++]))
}

describe("upsertNotificationRouting (ORR-798 NULL-entity natural-key upsert)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("UPDATEs the existing org-wide (entity_id NULL) row on disable — no duplicate INSERT", async () => {
    queueResults([
      // select().is('entity_id', null).maybeSingle() finds the enabled original
      { id: "existing-1" },
      // update(...).select().single() returns the disabled row
      {
        id: "existing-1",
        event_type: "deal_won",
        channel: "email",
        enabled: false,
        entity_id: null,
      },
    ])

    const { upsertNotificationRouting } = await import("../notifications")
    const result = await upsertNotificationRouting(ctx, {
      eventType: "deal_won",
      channel: "email",
      enabled: false,
    })

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, updated_by: "admin-1" }),
    )
    expect(insertSpy).not.toHaveBeenCalled()
    expect(result.enabled).toBe(false)
  })

  it("INSERTs when no org-wide row exists yet", async () => {
    queueResults([
      // no existing row
      null,
      // insert(...).select().single() returns the new row
      {
        id: "new-1",
        event_type: "mention",
        channel: "email",
        enabled: true,
        entity_id: null,
      },
    ])

    const { upsertNotificationRouting } = await import("../notifications")
    await upsertNotificationRouting(ctx, {
      eventType: "mention",
      channel: "email",
      enabled: true,
    })

    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "mention",
        channel: "email",
        enabled: true,
        entity_id: null,
      }),
    )
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
