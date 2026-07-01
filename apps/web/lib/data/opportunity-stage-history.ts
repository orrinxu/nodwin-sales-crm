import "server-only"
import type { DealStage } from "../workflows/deal-stage"
import { createServerClient } from "@/lib/supabase/server"
import type { OpportunityCallContext } from "./opportunities"
import { STAGE_ORDER, isTerminalStage } from "@/lib/opportunity"

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

export function determineStageEvent(
  from: DealStage,
  to: DealStage,
): string {
  if (from === to) return "ADVANCE"
  if (isTerminalStage(from) && !isTerminalStage(to)) return "REOPEN"
  if (to === "closed_won") return "CLOSE_WON"
  if (to === "closed_lost") return "CLOSE_LOST"
  /* eslint-disable security/detect-object-injection -- stage keys are typed DealStage */
  if (STAGE_ORDER[to] > STAGE_ORDER[from]) return "ADVANCE"
  if (STAGE_ORDER[to] < STAGE_ORDER[from]) return "MOVE_BACKWARD"
  /* eslint-enable security/detect-object-injection */
  return "ADVANCE"
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
  const creator = record.creator as { full_name: string } | null
  return {
    id: record.id as string,
    opportunityId: record.opportunity_id as string,
    fromStage: record.from_stage as DealStage,
    toStage: record.to_stage as DealStage,
    event: record.event as string,
    reason: (record.reason as string) ?? null,
    createdBy: (record.created_by as string) ?? null,
    createdByName: creator?.full_name ?? null,
    createdAt: record.created_at as string,
  }
}

export async function getStageHistoryForOpportunity(
  ctx: OpportunityCallContext,
  opportunityId: string,
): Promise<StageHistoryRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunity_stage_history")
    .select(
      `
      id,
      opportunity_id,
      from_stage,
      to_stage,
      event,
      reason,
      created_by,
      created_at
    `,
    )
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load stage history: ${error.message}`)
  }

  const rows = (data ?? []) as Record<string, unknown>[]

  // opportunity_stage_history.created_by has no FK to users, so a PostgREST
  // embed ("creator:created_by(full_name)") errors ("Could not find a
  // relationship..."). Resolve creator names with a separate lookup instead.
  const creatorIds = Array.from(
    new Set(
      rows
        .map((r) => r.created_by as string | null)
        .filter((v): v is string => !!v),
    ),
  )
  const nameById = new Map<string, string>()
  if (creatorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", creatorIds)
    for (const u of (users ?? []) as { id: string; full_name: string }[]) {
      nameById.set(u.id, u.full_name)
    }
  }

  return rows.map((r) => {
    const createdBy = r.created_by as string | null
    return fromDbRecord({
      ...r,
      creator: createdBy ? { full_name: nameById.get(createdBy) ?? null } : null,
    })
  })
}

export async function insertStageHistoryEntry(
  ctx: OpportunityCallContext,
  params: InsertStageHistoryParams,
): Promise<void> {
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("opportunity_stage_history")
    .insert(toDbInsert(params) as never)

  if (error) {
    throw new Error(`Failed to insert stage history: ${error.message}`)
  }
}
