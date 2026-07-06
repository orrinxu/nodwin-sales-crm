import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

// Capture RPC calls so we can assert the exact function names + params (quarter
// boundaries / period window) the data layer passes down.
const { rpcCalls, store } = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  store: {
    pipeline: [] as Record<string, unknown>[],
    curve: [] as Record<string, unknown>[],
    scorecard: [] as Record<string, unknown>[],
  },
}))

async function rpc(fn: string, args: unknown) {
  rpcCalls.push({ fn, args })
  if (fn === "forecast_pipeline_agg") return { data: store.pipeline, error: null }
  if (fn === "forecast_revenue_curve_agg") return { data: store.curve, error: null }
  if (fn === "rep_scorecard_agg") return { data: store.scorecard, error: null }
  return { data: [], error: null }
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
}))

// Stub the shared FX path. Rate table: USD×1, EUR×2, XXX = no rate (dropped +
// counted). This proves the data layer (a) routes every per-currency subtotal
// through the conversion path and (b) folds the converted results — the real FX
// math lives in lib/money/convert and is tested there.
const RATES: Record<string, number | null> = { USD: 1, EUR: 2, XXX: null }
vi.mock("./metrics", () => ({
  resolveReportingCurrency: async () => "USD",
  fetchAndConvert: async (
    data: Array<{ amount: number; currency: string } & Record<string, unknown>>,
  ) => {
    const converted: Array<Record<string, unknown>> = []
    let unconvertibleCount = 0
    for (const d of data ?? []) {
      const rate = RATES[d.currency]
      if (rate == null) {
        unconvertibleCount++
        continue
      }
      converted.push({ ...d, amount: d.amount * rate, currency: "USD" })
    }
    return { converted, unconvertibleCount }
  },
}))

import { getForecastData, quarterBoundaries } from "./forecast"

const ctx = { user: { id: "u1" } as never, source: "web" as const }
const NOW = new Date("2026-07-06T12:00:00.000Z") // Q3 2026

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  rpcCalls.length = 0
  store.pipeline = []
  store.curve = []
  store.scorecard = []
})
afterEach(() => vi.useRealTimers())

describe("quarterBoundaries", () => {
  it("computes half-open quarter windows in UTC", () => {
    expect(quarterBoundaries(new Date("2026-07-06T00:00:00Z"))).toEqual({
      thisQuarterStart: "2026-07-01",
      thisQuarterEnd: "2026-10-01",
      nextQuarterEnd: "2027-01-01",
    })
    // Q4 rolls the year over on the next-quarter boundary.
    expect(quarterBoundaries(new Date("2026-11-15T00:00:00Z"))).toEqual({
      thisQuarterStart: "2026-10-01",
      thisQuarterEnd: "2027-01-01",
      nextQuarterEnd: "2027-04-01",
    })
  })
})

describe("getForecastData", () => {
  it("calls each aggregate RPC with the resolved quarter window", async () => {
    await getForecastData(ctx)
    const byFn = Object.fromEntries(rpcCalls.map((c) => [c.fn, c.args]))
    expect(byFn.forecast_pipeline_agg).toEqual({
      p_this_quarter_start: "2026-07-01",
      p_this_quarter_end: "2026-10-01",
      p_next_quarter_end: "2027-01-01",
    })
    expect(byFn.rep_scorecard_agg).toEqual({
      p_period_start: "2026-07-01",
      p_period_end: "2026-10-01",
    })
    expect(rpcCalls.some((c) => c.fn === "forecast_revenue_curve_agg")).toBe(true)
  })

  it("weights, commits, and FX-normalises the forecast per period + stage", async () => {
    store.pipeline = [
      { period: "this_quarter", stage: "propose", currency: "USD", weighted_amount: 5000, gross_amount: 10000, deal_count: 2 },
      { period: "this_quarter", stage: "negotiate", currency: "EUR", weighted_amount: 1000, gross_amount: 2000, deal_count: 1 },
      { period: "this_quarter", stage: "closed_won", currency: "USD", weighted_amount: 0, gross_amount: 8000, deal_count: 1 },
      { period: "next_quarter", stage: "propose", currency: "USD", weighted_amount: 3000, gross_amount: 6000, deal_count: 1 },
      { period: "other", stage: "qualify", currency: "USD", weighted_amount: 500, gross_amount: 1000, deal_count: 1 },
      { period: "this_quarter", stage: "qualify", currency: "XXX", weighted_amount: 999, gross_amount: 999, deal_count: 1 },
    ]

    const data = await getForecastData(ctx)

    // Weighted this quarter: propose 5000 (USD) + negotiate 1000×2 (EUR). XXX dropped.
    expect(data.weightedThisQuarter).toBe(7000)
    // Committed = closed_won gross this quarter.
    expect(data.committedThisQuarter).toBe(8000)
    expect(data.weightedNextQuarter).toBe(3000)
    // All open weighted across periods (5000 + 2000 + 3000 + 500).
    expect(data.weightedPipelineTotal).toBe(10500)
    // All open gross across periods (10000 + 4000 + 6000 + 1000). closed_won excluded.
    expect(data.openPipelineTotal).toBe(21000)
    // XXX subtotal surfaced, not silently zeroed.
    expect(data.unconvertibleCount).toBeGreaterThanOrEqual(1)

    const thisQ = data.periodBreakdown.find((p) => p.period === "this_quarter")!
    expect(thisQ).toMatchObject({ weighted: 7000, committed: 8000, openPipeline: 14000 })

    // Stage breakdown folds propose across this + next quarter.
    const propose = data.stageBreakdown.find((s) => s.stage === "propose")!
    expect(propose.weighted).toBe(8000)
    expect(data.stageBreakdown.find((s) => s.stage === "negotiate")!.weighted).toBe(2000)
    // Terminal / zero-weight stages are filtered out of the breakdown.
    expect(data.stageBreakdown.some((s) => s.stage === "closed_won")).toBe(false)
  })

  it("sums the revenue curve per month across currencies, sorted", async () => {
    store.curve = [
      { month: "2026-06-01", currency: "USD", amount: 3000, entry_count: 1 },
      { month: "2026-05-01", currency: "USD", amount: 1000, entry_count: 1 },
      { month: "2026-05-01", currency: "EUR", amount: 500, entry_count: 1 },
    ]
    const data = await getForecastData(ctx)
    expect(data.revenueCurve).toEqual([
      { month: "2026-05", amount: 2000 }, // 1000 + 500×2
      { month: "2026-06", amount: 3000 },
    ])
  })

  it("builds rep scorecards: FX fold, win rate, avg cycle, unassigned bucket", async () => {
    store.scorecard = [
      { owner_user_id: "a", owner_name: "Alice", currency: "USD", open_amount: 10000, weighted_amount: 5000, won_amount: 4000, won_count: 2, lost_count: 1, cycle_days_sum: 60 },
      { owner_user_id: "a", owner_name: "Alice", currency: "EUR", open_amount: 1000, weighted_amount: 500, won_amount: 1000, won_count: 1, lost_count: 0, cycle_days_sum: 20 },
      { owner_user_id: null, owner_name: null, currency: "USD", open_amount: 2000, weighted_amount: 1000, won_amount: 0, won_count: 0, lost_count: 2, cycle_days_sum: 0 },
    ]
    const data = await getForecastData(ctx)

    expect(data.scorecard).toHaveLength(2)
    const alice = data.scorecard.find((r) => r.ownerId === "a")!
    expect(alice.ownerName).toBe("Alice")
    expect(alice.openPipeline).toBe(12000) // 10000 + 1000×2
    expect(alice.weightedPipeline).toBe(6000) // 5000 + 500×2
    expect(alice.won).toBe(6000) // 4000 + 1000×2
    expect(alice.winRate).toBe(75) // won 3 / closed 4
    expect(alice.avgSalesCycleDays).toBe(27) // round(80/3)

    const unassigned = data.scorecard.find((r) => r.ownerId === null)!
    expect(unassigned.ownerName).toBe("Unassigned")
    expect(unassigned.winRate).toBe(0) // 0 won / 2 closed
    expect(unassigned.avgSalesCycleDays).toBeNull() // no won deals

    // Sorted by weighted pipeline desc.
    expect(data.scorecard.map((r) => r.ownerId)).toEqual(["a", null])
  })

  it("returns zeroed, empty structures when every aggregate is empty", async () => {
    const data = await getForecastData(ctx)
    expect(data.currency).toBe("USD")
    expect(data.weightedThisQuarter).toBe(0)
    expect(data.stageBreakdown).toEqual([])
    expect(data.revenueCurve).toEqual([])
    expect(data.scorecard).toEqual([])
    expect(data.unconvertibleCount).toBe(0)
  })
})
