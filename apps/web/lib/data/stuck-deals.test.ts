import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const { store } = vi.hoisted(() => ({
  store: {
    opportunities: [] as Record<string, unknown>[],
    activities: [] as Record<string, unknown>[],
  },
}))

// Fake RLS-bound client: from("opportunities").select(...).in(...) is thenable;
// rpc("stuck_deal_last_activity", {opp_ids}) returns MAX(created_at) per opp
// (mirrors the server-side aggregate, scoped to the requested ids).
class QB {
  select() { return this }
  in() { return this }
  then<T>(onF: (v: { data: unknown; error: null }) => T) {
    return Promise.resolve({ data: store.opportunities, error: null }).then(onF)
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
  createServerClient: async () => ({ from: () => new QB(), rpc }),
}))

// Stub the currency machinery — this test is about stuck/overdue logic, not FX.
// Deals in currency "XXX" model an unconvertible deal (no FX rate) → dropped + counted.
vi.mock("./metrics", () => ({
  resolveReportingCurrency: async () => "USD",
  fetchAndConvert: async (data: Array<{ amount: number | null; currency: string }>) => {
    const converted: Array<Record<string, unknown>> = []
    let unconvertibleCount = 0
    for (const d of data ?? []) {
      if (d.currency === "XXX") { unconvertibleCount++; continue }
      converted.push({ ...d, amount: Number(d.amount ?? 0), currency: "USD" })
    }
    return { converted, unconvertibleCount }
  },
}))

vi.mock("./stuck-deal-settings", () => ({
  resolveStuckThresholds: async () => ({
    qualify: 21, meet_and_present: 14, propose: 10, negotiate: 7, verbal_agreement: 5,
  }),
}))

import { getStuckDeals } from "./stuck-deals"
import { getStageLabel } from "./opportunities.types"

const ctx = { user: { id: "u1" } as never, source: "web" as const }

// Fixed "now" so day-deltas are deterministic.
const NOW = new Date("2026-07-05T12:00:00.000Z")
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  store.opportunities = []
  store.activities = []
})
afterEach(() => vi.useRealTimers())

function opp(o: Partial<Record<string, unknown>> & { id: string; stage: string; amount: number }) {
  return {
    name: `Deal ${o.id}`, currency: "USD", close_date: null,
    created_at: daysAgo(60), account: { name: `Acct ${o.id}` }, ...o,
  }
}

describe("getStuckDeals", () => {
  it("flags stale (>= threshold) and excludes fresh deals", async () => {
    store.opportunities = [
      opp({ id: "A", stage: "qualify", amount: 500 }),  // qualify=21
      opp({ id: "B", stage: "negotiate", amount: 999, close_date: "2026-08-01" }), // negotiate=7, fresh
    ]
    store.activities = [
      { opportunity_id: "A", created_at: daysAgo(30) }, // stale (30 >= 21)
      { opportunity_id: "B", created_at: daysAgo(3) },  // fresh (3 < 7)
    ]
    const { deals } = await getStuckDeals(ctx)
    expect(deals.map((d) => d.id)).toEqual(["A"])
    expect(deals[0].reasons).toEqual(["stale"])
    expect(deals[0].daysSinceLastActivity).toBe(30)
    expect(deals[0].hasActivity).toBe(true)
  })

  it("carries the stage key through (used by StageBadge in the widget)", async () => {
    store.opportunities = [opp({ id: "A", stage: "negotiate", amount: 500 })]
    store.activities = [{ opportunity_id: "A", created_at: daysAgo(30) }] // negotiate=7 → stale
    const { deals } = await getStuckDeals(ctx)
    expect(deals[0].stage).toBe("negotiate")
    expect(deals[0].stageLabel).toBe(getStageLabel("negotiate"))
  })

  it("ages a zero-activity deal from created_at, never updated_at", async () => {
    store.opportunities = [opp({ id: "C", stage: "propose", amount: 1000, created_at: daysAgo(40) })]
    store.activities = []
    const { deals } = await getStuckDeals(ctx)
    expect(deals).toHaveLength(1)
    expect(deals[0].hasActivity).toBe(false)
    expect(deals[0].daysSinceLastActivity).toBe(40)
    expect(deals[0].reasons).toEqual(["stale"])
  })

  it("flags overdue (past close_date, still open) as a separate reason", async () => {
    store.opportunities = [
      opp({ id: "D", stage: "qualify", amount: 200, close_date: "2026-07-04" }), // yesterday
    ]
    store.activities = [{ opportunity_id: "D", created_at: daysAgo(2) }] // fresh, not stale
    const { deals } = await getStuckDeals(ctx)
    expect(deals[0].reasons).toEqual(["overdue"])
  })

  it("reports both reasons when a deal is stale AND overdue", async () => {
    store.opportunities = [
      opp({ id: "E", stage: "negotiate", amount: 800, close_date: "2026-07-04" }),
    ]
    store.activities = [{ opportunity_id: "E", created_at: daysAgo(10) }] // negotiate=7 → stale
    const { deals } = await getStuckDeals(ctx)
    expect(deals[0].reasons).toEqual(["stale", "overdue"])
  })

  it("sorts by value-at-risk descending and totals it", async () => {
    store.opportunities = [
      opp({ id: "A", stage: "qualify", amount: 500 }),
      opp({ id: "C", stage: "propose", amount: 1000, created_at: daysAgo(40) }),
      opp({ id: "D", stage: "qualify", amount: 200, close_date: "2026-07-04" }),
      opp({ id: "E", stage: "negotiate", amount: 800, close_date: "2026-07-04" }),
    ]
    store.activities = [
      { opportunity_id: "A", created_at: daysAgo(30) },
      { opportunity_id: "D", created_at: daysAgo(2) },
      { opportunity_id: "E", created_at: daysAgo(10) },
    ]
    const { deals, totalValueAtRisk } = await getStuckDeals(ctx)
    expect(deals.map((d) => d.id)).toEqual(["C", "E", "A", "D"])
    expect(totalValueAtRisk).toBe(2500)
  })

  it("drops unconvertible-currency deals from value-at-risk but reports the count", async () => {
    store.opportunities = [
      opp({ id: "A", stage: "qualify", amount: 500 }),
      opp({ id: "X", stage: "qualify", amount: 9999, currency: "XXX" }), // no FX rate
    ]
    store.activities = [
      { opportunity_id: "A", created_at: daysAgo(30) },
      { opportunity_id: "X", created_at: daysAgo(30) },
    ]
    const { deals, unconvertibleCount } = await getStuckDeals(ctx)
    expect(deals.map((d) => d.id)).toEqual(["A"]) // X dropped, not silently lost
    expect(unconvertibleCount).toBe(1)
  })

  it("returns an empty result when there are no open deals", async () => {
    store.opportunities = []
    const { deals, totalValueAtRisk, currency } = await getStuckDeals(ctx)
    expect(deals).toEqual([])
    expect(totalValueAtRisk).toBe(0)
    expect(currency).toBe("USD")
  })
})
