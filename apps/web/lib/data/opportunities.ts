import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES, type DealStage } from "@/lib/opportunity"
import type {
  OpportunityRecord,
  OpportunityListResult,
} from "./opportunities.types"
import { getStageLabel } from "./opportunities.types"

export type {
  OpportunityRecord,
  OpportunityListResult,
} from "./opportunities.types"

export { getStageLabel } from "./opportunities.types"

export interface OpportunityCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export const opportunityStageUpdateSchema = z.object({
  stage: z.enum(DEAL_STAGES),
})

export type OpportunityStageUpdateInput = z.infer<typeof opportunityStageUpdateSchema>

function toDomainOpportunity(data: Record<string, unknown>): OpportunityRecord {
  const account = data.account as { name: string } | null
  const owner = data.owner as { full_name: string } | null
  return {
    id: data.id as string,
    name: data.name as string,
    accountId: data.account_id as string,
    accountName: account?.name ?? null,
    primaryContactId: (data.primary_contact_id as string) ?? null,
    stage: data.stage as DealStage,
    probabilityPct: Number(data.probability_pct ?? 0),
    amount: Number(data.amount ?? 0),
    currency: (data.currency as string) ?? "USD",
    ownerUserId: data.owner_user_id as string,
    ownerName: owner?.full_name ?? null,
    salesUnitId: data.sales_unit_id as string,
    description: (data.description as string) ?? null,
    closeDate: (data.close_date as string) ?? null,
    lossReason: (data.loss_reason as string) ?? null,
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getOpportunities(
  ctx: OpportunityCallContext,
): Promise<OpportunityListResult> {
  const supabase = await createServerClient()

  const { data, error, count } = await supabase
    .from("opportunities")
    .select(
      `
      id,
      name,
      account_id,
      primary_contact_id,
      stage,
      probability_pct,
      amount,
      currency,
      owner_user_id,
      sales_unit_id,
      description,
      close_date,
      loss_reason,
      custom_data,
      created_at,
      updated_at,
      account:account_id ( name ),
      owner:owner_user_id ( full_name )
    `,
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load opportunities: ${error.message}`)
  }

  const opportunities = (data ?? []).map(toDomainOpportunity)
  const totalCount = count ?? 0

  return { opportunities, totalCount }
}

export async function getOpportunityById(
  ctx: OpportunityCallContext,
  id: string,
): Promise<OpportunityRecord | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      `
      id,
      name,
      account_id,
      primary_contact_id,
      stage,
      probability_pct,
      amount,
      currency,
      owner_user_id,
      sales_unit_id,
      description,
      close_date,
      loss_reason,
      custom_data,
      created_at,
      updated_at,
      account:account_id ( name ),
      owner:owner_user_id ( full_name )
    `,
    )
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw new Error(`Failed to load opportunity: ${error.message}`)
  }

  return toDomainOpportunity(data as Record<string, unknown>)
}

export interface BusinessUnitOption {
  id: string
  name: string
}

export async function getBusinessUnitOptions(
  ctx: OpportunityCallContext,
): Promise<BusinessUnitOption[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("business_units")
    .select("id, name")
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`Failed to load business units: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }))
}

export const opportunityCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  accountId: z.string().min(1, "Account is required"),
  amount: z.coerce.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  closeDate: z.string().optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  ownerUserId: z.string().optional(),
  salesUnitId: z.string().min(1, "Sales unit is required"),
  probabilityPct: z.coerce.number().min(0).max(100).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>

export async function createOpportunity(
  ctx: OpportunityCallContext,
  input: OpportunityCreateInput,
): Promise<OpportunityRecord> {
  const parsed = opportunityCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {
    name: parsed.name,
    account_id: parsed.accountId,
    owner_user_id: parsed.ownerUserId ?? ctx.user.id,
    sales_initiator_user_id: ctx.user.id,
    sales_unit_id: parsed.salesUnitId,
    amount: parsed.amount ?? 0,
    currency: parsed.currency ?? "USD",
    probability_pct: parsed.probabilityPct ?? 0,
  }

  if (parsed.closeDate) {
    dbData.close_date = parsed.closeDate
  }

  if (parsed.description) {
    dbData.description = parsed.description
  }

  if (parsed.customData) {
    dbData.custom_data = parsed.customData
  }

  const { data, error } = await supabase
    .from("opportunities")
    .insert(dbData)
    .select(
      `
      id,
      name,
      account_id,
      primary_contact_id,
      stage,
      probability_pct,
      amount,
      currency,
      owner_user_id,
      sales_unit_id,
      description,
      close_date,
      loss_reason,
      custom_data,
      created_at,
      updated_at,
      account:account_id ( name ),
      owner:owner_user_id ( full_name )
    `,
    )
    .single()

  if (error) {
    throw new Error(`Failed to create opportunity: ${error.message}`)
  }

  return toDomainOpportunity(data as Record<string, unknown>)
}

export async function updateOpportunityStage(
  ctx: OpportunityCallContext,
  id: string,
  input: OpportunityStageUpdateInput,
): Promise<OpportunityRecord> {
  const parsed = opportunityStageUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("opportunities")
    .update({ stage: parsed.stage })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to update opportunity stage: ${error.message}`)
  }

  const updated = await getOpportunityById(ctx, id)
  if (!updated) throw new Error("Opportunity not found after stage update")
  return updated
}
