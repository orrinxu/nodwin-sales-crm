import { describe, it, expect } from "vitest"
import {
  isHotLead,
  isOverdue,
  sumByCurrency,
  formatColumnTotal,
  HOT_LEAD_PROBABILITY_PCT,
} from "./kanban-intel"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import type { DealStage } from "./stage"

function makeOpp(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp-1",
    name: "Test Deal",
    accountId: "acc-1",
    accountName: "Acme",
    primaryContactId: null,
    primaryContactName: null,
    billingEntityName: null,
    entitySalesName: null,
    stage: "qualify" as DealStage,
    probabilityPct: 50,
    amount: "1000.00",
    currency: "USD",
    ownerUserId: "user-1",
    ownerName: "Rep",
    salesUnitId: "unit-1",
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

describe("isHotLead", () => {
  it("is hot at exactly the threshold on a non-terminal stage", () => {
    expect(isHotLead(makeOpp({ probabilityPct: HOT_LEAD_PROBABILITY_PCT }))).toBe(true)
  })

  it("is hot above the threshold", () => {
    expect(isHotLead(makeOpp({ probabilityPct: 90 }))).toBe(true)
  })

  it("is not hot below the threshold", () => {
    expect(isHotLead(makeOpp({ probabilityPct: 69 }))).toBe(false)
  })

  it("is never hot on a terminal stage even at 100%", () => {
    expect(isHotLead(makeOpp({ stage: "closed_won", probabilityPct: 100 }))).toBe(false)
    expect(isHotLead(makeOpp({ stage: "closed_lost", probabilityPct: 100 }))).toBe(false)
  })
})

describe("isOverdue", () => {
  const today = "2026-07-02"

  it("is overdue when close date is strictly before today", () => {
    expect(isOverdue(makeOpp({ closeDate: "2026-07-01" }), today)).toBe(true)
  })

  it("is not overdue when close date is today", () => {
    expect(isOverdue(makeOpp({ closeDate: "2026-07-02" }), today)).toBe(false)
  })

  it("is not overdue when close date is in the future", () => {
    expect(isOverdue(makeOpp({ closeDate: "2026-08-01" }), today)).toBe(false)
  })

  it("handles full ISO timestamps by comparing the date part", () => {
    expect(isOverdue(makeOpp({ closeDate: "2026-07-01T23:59:59Z" }), today)).toBe(true)
  })

  it("is not overdue without a close date", () => {
    expect(isOverdue(makeOpp({ closeDate: null }), today)).toBe(false)
  })

  it("is never overdue on a terminal stage even with a past close date", () => {
    expect(isOverdue(makeOpp({ stage: "closed_won", closeDate: "2020-01-01" }), today)).toBe(false)
    expect(isOverdue(makeOpp({ stage: "closed_lost", closeDate: "2020-01-01" }), today)).toBe(false)
  })
})

describe("sumByCurrency", () => {
  it("returns an empty array for no opportunities", () => {
    expect(sumByCurrency([])).toEqual([])
  })

  it("sums a single currency", () => {
    const totals = sumByCurrency([
      makeOpp({ amount: "1000.00", currency: "USD" }),
      makeOpp({ amount: "250.50", currency: "USD" }),
    ])
    expect(totals).toHaveLength(1)
    expect(totals[0].toAmount()).toBe("1250.50")
    expect(totals[0].currency).toBe("USD")
  })

  it("keeps distinct currencies separate in first-seen order", () => {
    const totals = sumByCurrency([
      makeOpp({ amount: "100.00", currency: "EUR" }),
      makeOpp({ amount: "200.00", currency: "USD" }),
      makeOpp({ amount: "50.00", currency: "EUR" }),
    ])
    expect(totals.map((m) => m.currency)).toEqual(["EUR", "USD"])
    expect(totals[0].toAmount()).toBe("150.00")
    expect(totals[1].toAmount()).toBe("200.00")
  })
})

describe("formatColumnTotal", () => {
  it("is empty for no opportunities", () => {
    expect(formatColumnTotal([])).toBe("")
  })

  it("joins per-currency subtotals with a middot", () => {
    const out = formatColumnTotal([
      makeOpp({ amount: "1000.00", currency: "USD" }),
      makeOpp({ amount: "500.00", currency: "EUR" }),
    ])
    expect(out).toContain("·")
    expect(out).toContain("1,000")
    expect(out).toContain("500")
  })
})
