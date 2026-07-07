import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import type { DealHealth } from "@/lib/opportunity/deal-health"
import { OpportunityCard } from "./opportunity-card"

vi.mock("server-only", () => ({}))

const base: OpportunityRecord = {
  id: "opp-1",
  name: "Big Deal",
  accountId: "acct-1",
  accountName: "Acme Corp",
  primaryContactId: null,
  stage: "propose",
  probabilityPct: 40, // below hot threshold (70) so "Hot" doesn't confound assertions
  amount: "50000.00",
  currency: "USD",
  ownerUserId: "user-1",
  ownerName: "Alice Johnson",
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
  closeDate: "2026-06-01",
  lossReason: null,
  visibilityTier: "standard",
  customData: {},
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
  health: null,
}

function make(health: DealHealth | null): OpportunityRecord {
  return { ...base, health }
}

function renderCard(opportunity: OpportunityRecord) {
  return render(
    <DndContext>
      <OpportunityCard opportunity={opportunity} />
    </DndContext>,
  )
}

describe("OpportunityCard health badges", () => {
  it("shows no health badge for a healthy deal", () => {
    renderCard(make(null))
    expect(screen.queryByText(/overdue/i)).toBeNull()
    expect(screen.queryByText(/no activity/i)).toBeNull()
  })

  it("shows an overdue badge with the day count", () => {
    renderCard(make({ overdue: { days: 5 }, stale: null }))
    expect(screen.getByText("5d overdue")).toBeTruthy()
    expect(screen.queryByText(/no activity/i)).toBeNull()
  })

  it("shows a stale badge with the day count", () => {
    renderCard(make({ overdue: null, stale: { days: 12, thresholdDays: 7 } }))
    expect(screen.getByText("12d no activity")).toBeTruthy()
    expect(screen.queryByText(/overdue/i)).toBeNull()
  })

  it("shows both badges when a deal is overdue and stale", () => {
    renderCard(make({ overdue: { days: 3 }, stale: { days: 20, thresholdDays: 7 } }))
    expect(screen.getByText("3d overdue")).toBeTruthy()
    expect(screen.getByText("20d no activity")).toBeTruthy()
  })

  it("shows no health badge when health is undefined (record from a non-pipeline path)", () => {
    const { health: _omit, ...withoutHealth } = base
    void _omit
    renderCard(withoutHealth as OpportunityRecord)
    expect(screen.queryByText(/overdue/i)).toBeNull()
    expect(screen.queryByText(/no activity/i)).toBeNull()
  })

  it("still shows the Hot badge (probability-driven) alongside health", () => {
    renderCard({ ...make({ overdue: { days: 2 }, stale: null }), probabilityPct: 80 })
    expect(screen.getByText("Hot")).toBeTruthy()
    expect(screen.getByText("2d overdue")).toBeTruthy()
  })
})
