import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES, type DealStage } from "@/lib/opportunity"
import {
  insertStageHistoryEntry,
  determineStageEvent,
} from "@/lib/data/opportunity-stage-history"
import { Money } from "@/lib/money"
import type {
  OpportunityRecord,
  OpportunityListResult,
  BusinessUnitOption,
  OpportunitySplit,
  OpportunitySplitInput,
  OpportunityTeamMember,
  OpportunityTeamMemberInput,
  UserOption,
  OpportunityCreateInput as OCI_Interface,
  OpportunitySplitsUpdateInput as OSUI_Interface,
} from "./opportunities.types"
import {
  getStageLabel,
  PROJECT_TYPES,
  REVENUE_CATEGORIES,
  RECURRING_SPLIT_KINDS,
  VISIBILITY_TIERS,
  SERVICE_TYPES,
  PROPERTY_TYPES,
} from "./opportunities.types"

export type {
  OpportunityRecord,
  OpportunityListResult,
  BusinessUnitOption,
  OpportunitySplit,
  OpportunitySplitInput,
  OpportunityTeamMember,
  OpportunityTeamMemberInput,
  UserOption,
} from "./opportunities.types"

export { getStageLabel } from "./opportunities.types"

export { PROJECT_TYPES, REVENUE_CATEGORIES, RECURRING_SPLIT_KINDS, VISIBILITY_TIERS, SERVICE_TYPES, PROPERTY_TYPES }

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
  const currency = (data.currency as string) ?? "USD"
  const amount = Money.fromAmount(String(data.amount ?? 0), currency).toAmount()
  return {
    id: data.id as string,
    name: data.name as string,
    accountId: data.account_id as string,
    accountName: account?.name ?? null,
    primaryContactId: (data.primary_contact_id as string) ?? null,
    stage: data.stage as DealStage,
    probabilityPct: Number(data.probability_pct ?? 0),
    amount,
    currency,
    ownerUserId: data.owner_user_id as string,
    ownerName: owner?.full_name ?? null,
    salesInitiatorUserId: data.sales_initiator_user_id as string,
    salesUnitId: data.sales_unit_id as string,
    revenueRecognitionUnitId: (data.revenue_recognition_unit_id as string) ?? null,
    billingEntityId: (data.billing_entity_id as string) ?? null,
    entitySalesId: (data.entity_sales_id as string) ?? null,
    serviceType: (data.service_type as string[]) ?? null,
    propertyType: (data.property_type as string) ?? null,
    barterValue: data.barter_value != null ? Money.fromAmount(String(data.barter_value), currency).toAmount() : null,
    servicePeriodStart: (data.service_period_start as string) ?? null,
    servicePeriodEnd: (data.service_period_end as string) ?? null,
    executionDate: (data.execution_date as string) ?? null,
    estimatedGrossMarginPct: data.estimated_gross_margin_pct != null
      ? Number(data.estimated_gross_margin_pct)
      : null,
    countryExecution: (data.country_execution as string) ?? null,
    projectType: (data.project_type as string) ?? null,
    revenueCategory: (data.revenue_category as string) ?? null,
    recurring: Boolean(data.recurring),
    recurringSplitKind: (data.recurring_split_kind as string) ?? null,
    description: (data.description as string) ?? null,
    closeDate: (data.close_date as string) ?? null,
    lossReason: (data.loss_reason as string) ?? null,
    visibilityTier: (data.visibility_tier as string) ?? "standard",
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
      sales_initiator_user_id,
      sales_unit_id,
      revenue_recognition_unit_id,
      billing_entity_id,
      entity_sales_id,
      service_type,
      property_type,
      barter_value,
      service_period_start,
      service_period_end,
      execution_date,
      estimated_gross_margin_pct,
      country_execution,
      project_type,
      revenue_category,
      recurring,
      recurring_split_kind,
      description,
      close_date,
      loss_reason,
      visibility_tier,
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
      sales_initiator_user_id,
      sales_unit_id,
      revenue_recognition_unit_id,
      billing_entity_id,
      entity_sales_id,
      service_type,
      property_type,
      barter_value,
      service_period_start,
      service_period_end,
      execution_date,
      estimated_gross_margin_pct,
      country_execution,
      project_type,
      revenue_category,
      recurring,
      recurring_split_kind,
      description,
      close_date,
      loss_reason,
      visibility_tier,
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

const opportunityCreateObject = z.object({
  name: z.string().min(1, "Name is required").max(200),
  accountId: z.string().min(1, "Account is required"),
  primaryContactId: z.string().optional(),
  stage: z.enum(DEAL_STAGES),
  salesUnitId: z.string().min(1, "Sales unit is required"),
  revenueRecognitionUnitId: z.string().optional(),
  billingEntityId: z.string().optional(),
  entitySalesId: z.string().optional(),
  serviceType: z.array(z.enum(SERVICE_TYPES)).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  barterValue: z.preprocess(
    (val) => {
      if (val === undefined || val === "" || val === 0) return undefined
      return String(val)
    },
    z.string().optional(),
  ),
  amount: z.preprocess(
    (val) => {
      if (val === undefined || val === "" || val === 0) return undefined
      return String(val)
    },
    z.string().optional(),
  ),
  currency: z.string().max(10).optional(),
  servicePeriodStart: z.string().optional().or(z.literal("")),
  servicePeriodEnd: z.string().optional().or(z.literal("")),
  closeDate: z.string().optional().or(z.literal("")),
  executionDate: z.string().optional().or(z.literal("")),
  estimatedGrossMarginPct: z.coerce.number().optional(),
  countryExecution: z.string().max(100).optional().or(z.literal("")),
  projectType: z.enum(PROJECT_TYPES).optional(),
  revenueCategory: z.enum(REVENUE_CATEGORIES).optional(),
  recurring: z.coerce.boolean().optional(),
  recurringSplitKind: z.enum(RECURRING_SPLIT_KINDS).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  lossReason: z.string().max(2000).optional().or(z.literal("")),
  ownerUserId: z.string().optional(),
  probabilityPct: z.coerce.number().min(0).max(100).optional(),
  visibilityTier: z.enum(VISIBILITY_TIERS).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export const opportunityCreateSchema = opportunityCreateObject
  .superRefine((data, ctx) => {
    if (data.recurring && !data.recurringSplitKind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring split kind is required when recurring is enabled",
        path: ["recurringSplitKind"],
      })
    }
  })
  .superRefine((data, ctx) => {
    if (data.stage === "closed_lost" && !data.lossReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Loss reason is required when stage is Closed Lost",
        path: ["lossReason"],
      })
    }
  })

export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>

export const opportunityUpdateSchema = opportunityCreateObject
  .partial()
  .superRefine((data, ctx) => {
    if (data.recurring && !data.recurringSplitKind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring split kind is required when recurring is enabled",
        path: ["recurringSplitKind"],
      })
    }
  })
  .superRefine((data, ctx) => {
    if (data.stage === "closed_lost" && !data.lossReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Loss reason is required when stage is Closed Lost",
        path: ["lossReason"],
      })
    }
  })

export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>

export async function createOpportunity(
  ctx: OpportunityCallContext,
  input: OpportunityCreateInput,
): Promise<OpportunityRecord> {
  const parsed = opportunityCreateSchema.parse(input)
  const supabase = await createServerClient()

  const currency = parsed.currency ?? "USD"
  const amountMoney = Money.fromAmount(parsed.amount ?? "0", currency)

  const dbData: Record<string, unknown> = {
    name: parsed.name,
    account_id: parsed.accountId,
    owner_user_id: parsed.ownerUserId ?? ctx.user.id,

    sales_unit_id: parsed.salesUnitId,
    stage: parsed.stage,
    amount: amountMoney.toAmount(),
    currency,
    probability_pct: parsed.probabilityPct ?? 0,
  }

  if (parsed.primaryContactId) {
    dbData.primary_contact_id = parsed.primaryContactId
  }
  if (parsed.revenueRecognitionUnitId) {
    dbData.revenue_recognition_unit_id = parsed.revenueRecognitionUnitId
  }
  if (parsed.billingEntityId) {
    dbData.billing_entity_id = parsed.billingEntityId
  }
  if (parsed.entitySalesId) {
    dbData.entity_sales_id = parsed.entitySalesId
  }
  if (parsed.serviceType) {
    dbData.service_type = parsed.serviceType
  }
  if (parsed.propertyType) {
    dbData.property_type = parsed.propertyType
  }
  if (parsed.barterValue != null) {
    dbData.barter_value = parsed.barterValue
  }
  if (parsed.servicePeriodStart) {
    dbData.service_period_start = parsed.servicePeriodStart
  }
  if (parsed.servicePeriodEnd) {
    dbData.service_period_end = parsed.servicePeriodEnd
  }
  if (parsed.closeDate) {
    dbData.close_date = parsed.closeDate
  }
  if (parsed.executionDate) {
    dbData.execution_date = parsed.executionDate
  }
  if (parsed.estimatedGrossMarginPct != null) {
    dbData.estimated_gross_margin_pct = parsed.estimatedGrossMarginPct
  }
  if (parsed.countryExecution) {
    dbData.country_execution = parsed.countryExecution
  }
  if (parsed.projectType) {
    dbData.project_type = parsed.projectType
  }
  if (parsed.revenueCategory) {
    dbData.revenue_category = parsed.revenueCategory
  }
  if (parsed.recurring !== undefined) {
    dbData.recurring = parsed.recurring
  }
  if (parsed.recurringSplitKind) {
    dbData.recurring_split_kind = parsed.recurringSplitKind
  }
  if (parsed.description) {
    dbData.description = parsed.description
  }
  if (parsed.lossReason) {
    dbData.loss_reason = parsed.lossReason
  }
  if (parsed.visibilityTier) {
    dbData.visibility_tier = parsed.visibilityTier
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
      sales_initiator_user_id,
      sales_unit_id,
      revenue_recognition_unit_id,
      billing_entity_id,
      entity_sales_id,
      service_type,
      property_type,
      barter_value,
      service_period_start,
      service_period_end,
      execution_date,
      estimated_gross_margin_pct,
      country_execution,
      project_type,
      revenue_category,
      recurring,
      recurring_split_kind,
      description,
      close_date,
      loss_reason,
      visibility_tier,
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

  const opportunity = toDomainOpportunity(data as Record<string, unknown>)

  if (opportunity.ownerUserId && opportunity.ownerUserId !== ctx.user.id) {
    import("../notifications/triggers").then(({ notifyDealAssigned }) =>
      notifyDealAssigned({
        opportunityId: opportunity.id,
        opportunityName: opportunity.name,
        newOwnerUserId: opportunity.ownerUserId!,
      }),
    )
  }

  return opportunity
}

export async function updateOpportunity(
  ctx: OpportunityCallContext,
  id: string,
  input: OpportunityUpdateInput,
): Promise<OpportunityRecord> {
  const parsed = opportunityUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const existing = await getOpportunityById(ctx, id)
  if (!existing) throw new Error("Opportunity not found for update")

  const dbData: Record<string, unknown> = {}

  if (parsed.name !== undefined) dbData.name = parsed.name
  if (parsed.accountId !== undefined) dbData.account_id = parsed.accountId
  if (parsed.primaryContactId !== undefined) dbData.primary_contact_id = parsed.primaryContactId || null
  if (parsed.stage !== undefined) dbData.stage = parsed.stage
  if (parsed.amount !== undefined) {
    const updateCurrency = parsed.currency ?? existing.currency
    dbData.amount = Money.fromAmount(parsed.amount, updateCurrency).toAmount()
  }
  if (parsed.currency !== undefined) dbData.currency = parsed.currency
  if (parsed.servicePeriodStart !== undefined) dbData.service_period_start = parsed.servicePeriodStart || null
  if (parsed.servicePeriodEnd !== undefined) dbData.service_period_end = parsed.servicePeriodEnd || null
  if (parsed.closeDate !== undefined) dbData.close_date = parsed.closeDate || null
  if (parsed.executionDate !== undefined) dbData.execution_date = parsed.executionDate || null
  if (parsed.estimatedGrossMarginPct !== undefined) dbData.estimated_gross_margin_pct = parsed.estimatedGrossMarginPct ?? null
  if (parsed.countryExecution !== undefined) dbData.country_execution = parsed.countryExecution || null
  if (parsed.projectType !== undefined) dbData.project_type = parsed.projectType || null
  if (parsed.revenueCategory !== undefined) dbData.revenue_category = parsed.revenueCategory || null
  if (parsed.recurring !== undefined) dbData.recurring = parsed.recurring
  if (parsed.recurringSplitKind !== undefined) dbData.recurring_split_kind = parsed.recurringSplitKind || null
  if (parsed.description !== undefined) dbData.description = parsed.description || null
  if (parsed.lossReason !== undefined) dbData.loss_reason = parsed.lossReason || null
  if (parsed.ownerUserId !== undefined) dbData.owner_user_id = parsed.ownerUserId
  if (parsed.salesInitiatorUserId !== undefined) dbData.sales_initiator_user_id = parsed.salesInitiatorUserId
  if (parsed.salesUnitId !== undefined) dbData.sales_unit_id = parsed.salesUnitId
  if (parsed.revenueRecognitionUnitId !== undefined) dbData.revenue_recognition_unit_id = parsed.revenueRecognitionUnitId || null
  if (parsed.billingEntityId !== undefined) dbData.billing_entity_id = parsed.billingEntityId || null
  if (parsed.entitySalesId !== undefined) dbData.entity_sales_id = parsed.entitySalesId || null
  if (parsed.serviceType !== undefined) dbData.service_type = parsed.serviceType
  if (parsed.propertyType !== undefined) dbData.property_type = parsed.propertyType || null
  if (parsed.barterValue !== undefined) dbData.barter_value = parsed.barterValue || null
  if (parsed.probabilityPct !== undefined) dbData.probability_pct = parsed.probabilityPct
  if (parsed.visibilityTier !== undefined) dbData.visibility_tier = parsed.visibilityTier || null
  if (parsed.customData !== undefined) dbData.custom_data = parsed.customData

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("opportunities")
      .update(dbData)
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to update opportunity: ${error.message}`)
    }
  }

  const updated = await getOpportunityById(ctx, id)
  if (!updated) throw new Error("Opportunity not found after update")

  if (
    parsed.ownerUserId !== undefined &&
    parsed.ownerUserId !== existing.ownerUserId
  ) {
    const newOwnerUserId = parsed.ownerUserId
    import("../notifications/triggers").then(({ notifyDealAssigned }) =>
      notifyDealAssigned({
        opportunityId: updated.id,
        opportunityName: updated.name,
        newOwnerUserId,
      }),
    )
  }

  return updated
}

export async function updateOpportunityStage(
  ctx: OpportunityCallContext,
  id: string,
  input: OpportunityStageUpdateInput,
): Promise<OpportunityRecord> {
  const parsed = opportunityStageUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const existing = await getOpportunityById(ctx, id)
  if (!existing) throw new Error("Opportunity not found for stage update")

  if (existing.stage !== parsed.stage) {
    const event = determineStageEvent(existing.stage, parsed.stage)

    const { error } = await supabase
      .from("opportunities")
      .update({ stage: parsed.stage })
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to update opportunity stage: ${error.message}`)
    }

    try {
      await insertStageHistoryEntry(ctx, {
        opportunityId: id,
        fromStage: existing.stage,
        toStage: parsed.stage,
        event,
        createdBy: ctx.user.id,
      })
    } catch (historyError) {
      console.error(
        "Stage updated but failed to record history:",
        historyError instanceof Error ? historyError.message : historyError,
      )
    }

    import("../notifications/triggers").then(({ notifyStageChange }) =>
      notifyStageChange({
        opportunityId: id,
        opportunityName: existing.name,
        fromStage: existing.stage,
        toStage: parsed.stage,
        event,
        ownerUserId: existing.ownerUserId ?? ctx.user.id,
      }),
    )
  }

  const updated = await getOpportunityById(ctx, id)
  if (!updated) throw new Error("Opportunity not found after stage update")
  return updated
}

export const bulkStageUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one opportunity must be selected"),
  stage: z.enum(DEAL_STAGES),
})

export type BulkStageUpdateInput = z.infer<typeof bulkStageUpdateSchema>

export async function bulkUpdateOpportunityStage(
  ctx: OpportunityCallContext,
  input: BulkStageUpdateInput,
): Promise<void> {
  const parsed = bulkStageUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("opportunities")
    .update({ stage: parsed.stage })
    .in("id", parsed.ids)

  if (error) {
    throw new Error(`Failed to bulk update opportunity stages: ${error.message}`)
  }
}

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one opportunity must be selected"),
})

export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>

export async function bulkDeleteOpportunities(
  ctx: OpportunityCallContext,
  input: BulkDeleteInput,
): Promise<void> {
  const parsed = bulkDeleteSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("opportunities")
    .delete()
    .in("id", parsed.ids)

  if (error) {
    throw new Error(`Failed to bulk delete opportunities: ${error.message}`)
  }
}

// ── Opportunity Splits ──────────────────────────────────────────────────────────

const opportunitySplitSchema = z.object({
  salesUnitId: z.string().min(1, "Sales unit is required"),
  userId: z.string().nullable().optional(),
  pct: z.coerce.number().min(0).max(100),
  notes: z.string().max(500).nullable().optional(),
})

export const opportunitySplitsUpdateSchema = z.object({
  splits: z.array(opportunitySplitSchema),
})

export type OpportunitySplitsUpdateInput = z.infer<typeof opportunitySplitsUpdateSchema>

export async function getOpportunitySplits(
  ctx: OpportunityCallContext,
  opportunityId: string,
): Promise<OpportunitySplit[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunity_splits")
    .select(
      `
      id,
      opportunity_id,
      sales_unit_id,
      user_id,
      pct,
      notes,
      created_at
    `,
    )
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to load opportunity splits: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    opportunityId: r.opportunity_id as string,
    salesUnitId: r.sales_unit_id as string,
    userId: (r.user_id as string) ?? null,
    pct: Number(r.pct ?? 0),
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
  }))
}

export async function updateOpportunitySplits(
  ctx: OpportunityCallContext,
  opportunityId: string,
  input: OpportunitySplitsUpdateInput,
): Promise<void> {
  const parsed = opportunitySplitsUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const { error: deleteError } = await supabase
    .from("opportunity_splits")
    .delete()
    .eq("opportunity_id", opportunityId)

  if (deleteError) {
    throw new Error(`Failed to replace opportunity splits: ${deleteError.message}`)
  }

  if (parsed.splits.length === 0) return

  const { error: insertError } = await supabase
    .from("opportunity_splits")
    .insert(
      parsed.splits.map((s) => ({
        opportunity_id: opportunityId,
        sales_unit_id: s.salesUnitId,
        user_id: s.userId ?? null,
        pct: s.pct,
        notes: s.notes ?? null,
      })),
    )

  if (insertError) {
    throw new Error(`Failed to insert opportunity splits: ${insertError.message}`)
  }
}

// ── Opportunity Team Members ────────────────────────────────────────────────────

const opportunityTeamMemberSchema = z.object({
  userId: z.string().min(1, "User is required"),
  role: z.enum(["owner", "contributor", "viewer", "approver"]),
})

export const opportunityTeamUpdateSchema = z.object({
  members: z.array(opportunityTeamMemberSchema),
})

export type OpportunityTeamUpdateInput = z.infer<typeof opportunityTeamUpdateSchema>

export async function getOpportunityTeamMembers(
  ctx: OpportunityCallContext,
  opportunityId: string,
): Promise<OpportunityTeamMember[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunity_team_members")
    .select(
      `
      id,
      opportunity_id,
      user_id,
      role,
      added_by,
      added_at,
      member:user_id ( full_name )
    `,
    )
    .eq("opportunity_id", opportunityId)
    .order("added_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to load opportunity team members: ${error.message}`)
  }

  return (data ?? []).map((r) => {
    const member = (Array.isArray(r.member) ? r.member[0] : r.member) as { full_name: string } | null
    return {
      id: r.id as string,
      opportunityId: r.opportunity_id as string,
      userId: r.user_id as string,
      userName: member?.full_name ?? null,
      role: r.role as string,
      addedBy: (r.added_by as string) ?? null,
      addedAt: r.added_at as string,
    }
  })
}

export async function updateOpportunityTeamMembers(
  ctx: OpportunityCallContext,
  opportunityId: string,
  input: OpportunityTeamUpdateInput,
): Promise<void> {
  const parsed = opportunityTeamUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const { error: deleteError } = await supabase
    .from("opportunity_team_members")
    .delete()
    .eq("opportunity_id", opportunityId)

  if (deleteError) {
    throw new Error(`Failed to replace opportunity team members: ${deleteError.message}`)
  }

  if (parsed.members.length === 0) return

  const { error: insertError } = await supabase
    .from("opportunity_team_members")
    .insert(
      parsed.members.map((m) => ({
        opportunity_id: opportunityId,
        user_id: m.userId,
        role: m.role,
        added_by: ctx.user.id,
      })),
    )

  if (insertError) {
    throw new Error(`Failed to insert opportunity team members: ${insertError.message}`)
  }
}

// ── User Options ────────────────────────────────────────────────────────────────

export async function getUserOptions(
  ctx: OpportunityCallContext,
): Promise<UserOption[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("active", true)
    .order("full_name", { ascending: true })

  if (error) {
    throw new Error(`Failed to load users: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    fullName: (r.full_name as string) ?? r.id as string,
  }))
}

// ── Type-equivalence assertions ─────────────────────────────────────────────────

const _A1: OCI_Interface = null! as z.infer<typeof opportunityCreateSchema>
const _A2: z.infer<typeof opportunityCreateSchema> = null! as OCI_Interface
const _A3: OSUI_Interface = null! as z.infer<typeof opportunitySplitsUpdateSchema>
const _A4: z.infer<typeof opportunitySplitsUpdateSchema> = null! as OSUI_Interface

void _A1; void _A2; void _A3; void _A4
