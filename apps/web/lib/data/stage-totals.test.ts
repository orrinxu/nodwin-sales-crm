import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

// Stub the shared FX path. Rate table: USD×1, EUR×2, XXX = no rate (dropped +
// counted). This proves getStageTotals (a) routes every amount through the
// conversion path and normalises BEFORE summing, and (b) surfaces
// unconvertible amounts instead of silently zeroing them. The real FX math
// lives in lib/money/convert and is tested there.
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

import {
  aggregateStageTotals,
  getStageTotals,
  type ConvertedStageRow,
} from "./stage-totals"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import type { DealStage } from "@/lib/opportunity"

const ctx = { user: { id: "u1" } as never, source: "web" as const }

function opp(overrides: Partial<OpportunityRecord>): OpportunityRecord {
  return {
    id: "o1",
    name: "Deal",
    accountId: "a1",
    accountName: null,
    primaryContactId: null,
    stage: "qualify" as DealStage,
    probabilityPct: 50,
    amount: "1000.00",
    currency: "USD",
    ownerUserId: "u1",
    ownerName: null,
    salesUnitId: "s1",
    revenueRecognitionUnitId: null,
    billingEntityId: null,
    entitySalesId: null,
    serviceType: null,
    propertyType: null,
    barterValue: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    executionDate: null,
    estimatedGrossMarginPct: null,
    countryExecution: null,
    projectType: null,
    revenueCategory: null,
    recurring: false,
    recurringSplitKind: null,
    description: null,
    closeDate: null,
    lossReason: null,
    visibilityTier: "standard",
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("aggregateStageTotals", () => {
  it("returns a zeroed bucket for every stage when there are no rows", () => {
    const byStage = aggregateStageTotals([])
    expect(byStage.qualify).toEqual({ count: 0, total: 0, weighted: 0 })
    expect(byStage.closed_won).toEqual({ count: 0, total: 0, weighted: 0 })
    // Every known stage is present.
    expect(Object.keys(byStage)).toContain("negotiate")
  })

  it("counts, totals, and weights per stage using probabilityPct", () => {
    const rows: ConvertedStageRow[] = [
      { stage: "qualify", amount: 1000, probabilityPct: 20 },
      { stage: "qualify", amount: 500, probabilityPct: 40 },
      { stage: "propose", amount: 2000, probabilityPct: 75 },
    ]
    const byStage = aggregateStageTotals(rows)

    expect(byStage.qualify.count).toBe(2)
    expect(byStage.qualify.total).toBe(1500)
    // Weighted = 1000×0.20 + 500×0.40 = 200 + 200.
    expect(byStage.qualify.weighted).toBe(400)

    expect(byStage.propose.count).toBe(1)
    expect(byStage.propose.total).toBe(2000)
    // Weighting uses probability_pct: 2000×0.75.
    expect(byStage.propose.weighted).toBe(1500)

    // Untouched stages stay zeroed.
    expect(byStage.negotiate).toEqual({ count: 0, total: 0, weighted: 0 })
  })

  it("ignores rows whose stage is not a known DealStage", () => {
    const byStage = aggregateStageTotals([
      { stage: "bogus", amount: 999, probabilityPct: 100 },
      { stage: "qualify", amount: 100, probabilityPct: 100 },
    ])
    expect(byStage.qualify).toEqual({ count: 1, total: 100, weighted: 100 })
  })
})

describe("getStageTotals", () => {
  it("FX-normalises across currencies BEFORE summing per stage", async () => {
    const result = await getStageTotals(ctx, [
      opp({ stage: "qualify", amount: "1000", currency: "USD", probabilityPct: 50 }),
      // EUR converts ×2 → 2000 USD before it joins the same stage bucket.
      opp({ stage: "qualify", amount: "1000", currency: "EUR", probabilityPct: 50 }),
      opp({ stage: "propose", amount: "500", currency: "EUR", probabilityPct: 80 }),
    ])

    expect(result.currency).toBe("USD")
    // qualify total = 1000 (USD) + 2000 (EUR→USD), never 1000+1000 raw.
    expect(result.byStage.qualify.total).toBe(3000)
    expect(result.byStage.qualify.weighted).toBe(1500) // 3000 × 0.50
    expect(result.byStage.qualify.count).toBe(2)

    // propose = 500 EUR × 2 = 1000 USD, weighted 1000 × 0.80.
    expect(result.byStage.propose.total).toBe(1000)
    expect(result.byStage.propose.weighted).toBe(800)
    expect(result.unconvertibleCount).toBe(0)
  })

  it("skips and counts amounts with no FX rate instead of zeroing them", async () => {
    const result = await getStageTotals(ctx, [
      opp({ stage: "qualify", amount: "1000", currency: "USD", probabilityPct: 100 }),
      opp({ stage: "qualify", amount: "9999", currency: "XXX", probabilityPct: 100 }),
    ])
    // Only the convertible USD deal is folded in; XXX is surfaced, not summed.
    expect(result.byStage.qualify.total).toBe(1000)
    expect(result.byStage.qualify.count).toBe(1)
    expect(result.unconvertibleCount).toBe(1)
  })

  it("returns zeroed buckets for an empty scoped list", async () => {
    const result = await getStageTotals(ctx, [])
    expect(result.unconvertibleCount).toBe(0)
    expect(result.byStage.qualify).toEqual({ count: 0, total: 0, weighted: 0 })
  })
})
