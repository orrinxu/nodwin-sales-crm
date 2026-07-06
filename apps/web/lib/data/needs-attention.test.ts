import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const { store, eqCalls } = vi.hoisted(() => ({
  store: {
    opportunities: [] as Record<string, unknown>[],
    approvalStepsMine: [] as Record<string, unknown>[],
    approvalStepsPending: [] as Record<string, unknown>[],
    activities: [] as Record<string, unknown>[],
  },
  eqCalls: [] as [string, unknown][],
}))

// Fake RLS-bound client. The opportunities read and both approval_steps reads
// are thenable query builders; the second approval_steps read is distinguished
// from the first by the presence of an `.or(...)` clause (only the "steps
// assigned to me" query uses it).
class QB {
  table: string
  _or = false
  constructor(table: string) {
    this.table = table
  }
  select() { return this }
  eq(col: string, val: unknown) { eqCalls.push([col, val]); return this }
  in() { return this }
  or() { this._or = true; return this }
  limit() { return this }
  _resolve() {
    if (this.table === "opportunities") return { data: store.opportunities, error: null }
    if (this.table === "approval_steps") {
      return this._or
        ? { data: store.approvalStepsMine, error: null }
        : { data: store.approvalStepsPending, error: null }
    }
    return { data: [], error: null }
  }
  then<T>(onF: (v: { data: unknown; error: null }) => T) {
    return Promise.resolve(this._resolve()).then(onF)
  }
}

async function rpc(_fn: string, args: { opp_ids: string[] }) {
  const maxByOpp = new Map<string, string>()
  for (const a of store.activities) {
    const oppId = a.opportunity_id as string
    const createdAt = a.created_at as string
    if (!args.opp_ids.includes(oppId)) continue
    const prev = maxByOpp.get(oppId)
    if (prev === undefined || createdAt > prev) maxByOpp.set(oppId, createdAt)
  }
  return {
    data: [...maxByOpp].map(([opportunity_id, last_activity_at]) => ({ opportunity_id, last_activity_at })),
    error: null,
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from: (t: string) => new QB(t), rpc }),
}))

vi.mock("./stuck-deal-settings", () => ({
  resolveStuckThresholds: async () => ({
    qualify: 21, meet_and_present: 14, propose: 10, negotiate: 7, verbal_agreement: 5,
  }),
}))

import { getNeedsAttention } from "./needs-attention"

const ME = "me-1"
const ctx = { user: { id: ME } as never, source: "web" as const }

const NOW = new Date("2026-07-05T12:00:00.000Z")
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}

function opp(o: Partial<Record<string, unknown>> & { id: string; stage: string }) {
  return { name: `Deal ${o.id}`, close_date: null, created_at: daysAgo(60), ...o }
}

function mineStep(o: {
  id: string; instance_id: string; step_order: number;
  status?: string; entity_type?: string; opp?: { id: string; name: string; stage: string } | null
}) {
  return {
    id: o.id,
    step_order: o.step_order,
    instance_id: o.instance_id,
    instance: {
      id: o.instance_id,
      status: o.status ?? "pending",
      entity_type: o.entity_type ?? "opportunity",
      opportunity: o.opp === undefined ? { id: `o-${o.instance_id}`, name: `Opp ${o.instance_id}`, stage: "propose" } : o.opp,
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  store.opportunities = []
  store.approvalStepsMine = []
  store.approvalStepsPending = []
  store.activities = []
  eqCalls.length = 0
})
afterEach(() => vi.useRealTimers())

describe("getNeedsAttention", () => {
  it("returns all-empty (total 0) when nothing needs attention", async () => {
    store.opportunities = [
      opp({ id: "fresh", stage: "qualify", close_date: "2026-12-01", created_at: daysAgo(1) }),
    ]
    store.activities = [{ opportunity_id: "fresh", created_at: daysAgo(1) }]
    const res = await getNeedsAttention(ctx)
    expect(res.total).toBe(0)
    expect(res.stale.count).toBe(0)
    expect(res.overdue.count).toBe(0)
    expect(res.approvals.count).toBe(0)
  })

  it("scopes the opportunity query to owner_user_id = me", async () => {
    await getNeedsAttention(ctx)
    expect(eqCalls).toContainEqual(["owner_user_id", ME])
  })

  it("buckets overdue (past close_date, still open)", async () => {
    store.opportunities = [
      opp({ id: "A", stage: "qualify", close_date: "2026-07-02", created_at: daysAgo(1) }), // 3d overdue
    ]
    store.activities = [{ opportunity_id: "A", created_at: daysAgo(1) }] // fresh → not stale
    const res = await getNeedsAttention(ctx)
    expect(res.overdue.count).toBe(1)
    expect(res.overdue.items[0].id).toBe("A")
    expect(res.overdue.items[0].reason).toBe("3d overdue")
    expect(res.stale.count).toBe(0)
  })

  it("buckets stale (quiet past the per-stage threshold) using MAX activity", async () => {
    store.opportunities = [opp({ id: "B", stage: "negotiate" })] // negotiate threshold = 7
    store.activities = [{ opportunity_id: "B", created_at: daysAgo(30) }]
    const res = await getNeedsAttention(ctx)
    expect(res.stale.count).toBe(1)
    expect(res.stale.items[0].id).toBe("B")
    expect(res.stale.items[0].reason).toBe("30d no activity")
    expect(res.stale.items[0].stage).toBe("negotiate")
  })

  it("ages a zero-activity deal from created_at (never treats it as fresh)", async () => {
    store.opportunities = [opp({ id: "C", stage: "propose", created_at: daysAgo(40) })] // propose = 10
    const res = await getNeedsAttention(ctx)
    expect(res.stale.count).toBe(1)
    expect(res.stale.items[0].reason).toBe("40d no activity")
  })

  it("limits each bucket to NEEDS_ATTENTION_LIMIT but reports the true count", async () => {
    store.opportunities = Array.from({ length: 7 }, (_, i) =>
      opp({ id: `O${i}`, stage: "qualify", close_date: "2026-06-01", created_at: daysAgo(1) }),
    )
    store.activities = store.opportunities.map((o) => ({ opportunity_id: o.id, created_at: daysAgo(1) }))
    const res = await getNeedsAttention(ctx)
    expect(res.overdue.count).toBe(7)
    expect(res.overdue.items).toHaveLength(5)
  })

  it("surfaces an approval step awaiting me when it is the current step", async () => {
    store.approvalStepsMine = [mineStep({ id: "s1", instance_id: "i1", step_order: 1 })]
    store.approvalStepsPending = [{ instance_id: "i1", step_order: 1 }]
    const res = await getNeedsAttention(ctx)
    expect(res.approvals.count).toBe(1)
    expect(res.approvals.items[0].id).toBe("o-i1")
    expect(res.approvals.items[0].reason).toBe("awaiting your approval")
  })

  it("excludes an approval step that is NOT yet my turn (an earlier step is pending)", async () => {
    store.approvalStepsMine = [mineStep({ id: "s2", instance_id: "i1", step_order: 2 })]
    store.approvalStepsPending = [
      { instance_id: "i1", step_order: 1 }, // someone else's earlier step still pending
      { instance_id: "i1", step_order: 2 },
    ]
    const res = await getNeedsAttention(ctx)
    expect(res.approvals.count).toBe(0)
  })

  it("excludes approval steps whose instance is not pending", async () => {
    store.approvalStepsMine = [mineStep({ id: "s3", instance_id: "i2", step_order: 1, status: "approved" })]
    store.approvalStepsPending = [{ instance_id: "i2", step_order: 1 }]
    const res = await getNeedsAttention(ctx)
    expect(res.approvals.count).toBe(0)
  })

  it("dedupes to one row per instance and sums total across buckets", async () => {
    store.opportunities = [
      opp({ id: "A", stage: "qualify", close_date: "2026-07-04", created_at: daysAgo(1) }), // overdue
      opp({ id: "B", stage: "negotiate", created_at: daysAgo(30) }), // stale
    ]
    store.approvalStepsMine = [
      mineStep({ id: "s1", instance_id: "i1", step_order: 1 }),
      mineStep({ id: "s1b", instance_id: "i1", step_order: 2 }), // same instance → deduped
    ]
    store.approvalStepsPending = [{ instance_id: "i1", step_order: 1 }]
    const res = await getNeedsAttention(ctx)
    expect(res.overdue.count).toBe(1)
    expect(res.stale.count).toBe(1)
    expect(res.approvals.count).toBe(1)
    expect(res.total).toBe(3)
  })
})
