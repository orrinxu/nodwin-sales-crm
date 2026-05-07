import type { DealStage } from "@/lib/opportunity"

export interface StageHistoryRecord {
  id: string
  opportunityId: string
  fromStage: DealStage
  toStage: DealStage
  event: string
  reason: string | null
  createdBy: string | null
  createdByName: string | null
  createdAt: string
}

export interface InsertStageHistoryParams {
  opportunityId: string
  fromStage: DealStage
  toStage: DealStage
  event: string
  reason?: string
  createdBy?: string
}
