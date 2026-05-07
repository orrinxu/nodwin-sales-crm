import type { DealStage } from "@/lib/opportunity"

export interface OpportunityRecord {
  id: string
  name: string
  accountId: string
  accountName: string | null
  primaryContactId: string | null
  stage: DealStage
  probabilityPct: number
  amount: number
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
