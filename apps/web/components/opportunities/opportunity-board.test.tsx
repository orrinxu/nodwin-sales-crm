import { describe, it, expect, vi } from "vitest"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import { OpportunityCard } from "./opportunity-card"
import { OpportunityColumn } from "./opportunity-column"

vi.mock("server-only", () => ({}))

const mockOpportunity: OpportunityRecord = {
  id: "opp-1",
  name: "Big Deal",
  accountId: "acct-1",
  accountName: "Acme Corp",
  primaryContactId: null,
  stage: "propose",
  probabilityPct: 60,
  amount: "50000.00",
  currency: "USD",
  ownerUserId: "user-1",
  ownerName: "Alice Johnson",
  salesInitiatorUserId: "user-1",
  salesUnitId: "unit-1",
  revenueRecognitionUnitId: null,
  billingEntityId: null,
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
}

describe("getStageLabel", () => {
  it("returns formatted label for each stage", () => {
    expect(getStageLabel("qualify")).toBe("Qualify")
    expect(getStageLabel("meet_and_present")).toBe("Meet & Present")
    expect(getStageLabel("propose")).toBe("Propose")
    expect(getStageLabel("negotiate")).toBe("Negotiate")
    expect(getStageLabel("verbal_agreement")).toBe("Verbal Agreement")
    expect(getStageLabel("closed_won")).toBe("Closed Won")
    expect(getStageLabel("closed_lost")).toBe("Closed Lost")
  })
})

describe("OpportunityCard", () => {
  it("renders without throwing", () => {
    expect(() => <OpportunityCard opportunity={mockOpportunity} />).not.toThrow()
  })

  it("renders a terminal stage opportunity", () => {
    const closedWon = { ...mockOpportunity, stage: "closed_won" as const }
    expect(() => <OpportunityCard opportunity={closedWon} />).not.toThrow()
  })
})

describe("OpportunityColumn", () => {
  it("renders column with opportunities", () => {
    expect(() => (
      <OpportunityColumn
        stage="propose"
        label="Propose"
        opportunities={[mockOpportunity]}
      />
    )).not.toThrow()
  })

  it("renders empty column", () => {
    expect(() => (
      <OpportunityColumn
        stage="qualify"
        label="Qualify"
        opportunities={[]}
      />
    )).not.toThrow()
  })
})
