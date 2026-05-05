import type { DealStage } from "../workflows/deal-stage"

export interface StageHistoryRecord {
  id: string
  opportunityId: string
  fromStage: DealStage
  toStage: DealStage
  event: string
  reason: string | null
  createdBy: string | null
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

export function toDbInsert(params: InsertStageHistoryParams): Record<string, unknown> {
  return {
    opportunity_id: params.opportunityId,
    from_stage: params.fromStage,
    to_stage: params.toStage,
    event: params.event,
    reason: params.reason ?? null,
    created_by: params.createdBy ?? null,
  }
}

export function fromDbRecord(record: Record<string, unknown>): StageHistoryRecord {
  return {
    id: record.id as string,
    opportunityId: record.opportunity_id as string,
    fromStage: record.from_stage as DealStage,
    toStage: record.to_stage as DealStage,
    event: record.event as string,
    reason: (record.reason as string) ?? null,
    createdBy: (record.created_by as string) ?? null,
    createdAt: record.created_at as string,
  }
}
