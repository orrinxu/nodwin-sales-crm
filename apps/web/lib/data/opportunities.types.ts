import type { DealStage } from "@/lib/opportunity"

export interface OpportunityRecord {
  id: string
  name: string
  accountId: string
  accountName: string | null
  primaryContactId: string | null
  stage: DealStage
  probabilityPct: number
  /** Decimal string representation of the amount (e.g. "50000.00"). Never a float. */
  amount: string
  currency: string
  ownerUserId: string
  ownerName: string | null
  salesUnitId: string
  description: string | null
  closeDate: string | null
  lossReason: string | null
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface OpportunityListResult {
  opportunities: OpportunityRecord[]
  totalCount: number
}

const stageLabels: Record<DealStage, string> = {
  qualify: "Qualify",
  meet_and_present: "Meet & Present",
  propose: "Propose",
  negotiate: "Negotiate",
  verbal_agreement: "Verbal Agreement",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
}

export function getStageLabel(stage: DealStage): string {
  return stageLabels[stage]
}

export interface BusinessUnitOption {
  id: string
  name: string
}

export interface OpportunityCreateInput {
  name: string
  accountId: string
  amount?: string
  currency?: string
  closeDate?: string
  description?: string
  ownerUserId?: string
  salesUnitId: string
  probabilityPct?: number
  customData?: Record<string, unknown>
}

export interface OpportunitySplit {
  id: string
  opportunityId: string
  salesUnitId: string
  userId: string | null
  pct: number
  notes: string | null
  createdAt: string
}

export interface OpportunitySplitInput {
  salesUnitId: string
  userId?: string | null
  pct: number
  notes?: string | null
}

export interface OpportunitySplitsUpdateInput {
  splits: OpportunitySplitInput[]
}

export interface OpportunityTeamMember {
  id: string
  opportunityId: string
  userId: string
  userName: string | null
  role: string
  addedBy: string | null
  addedAt: string
}

export interface OpportunityTeamMemberInput {
  userId: string
  role: string
}

export interface UserOption {
  id: string
  fullName: string
}
