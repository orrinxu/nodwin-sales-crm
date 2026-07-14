import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES, STAGE_ORDER, type DealStage } from "@/lib/opportunity"
import {
  insertStageHistoryEntry,
  determineStageEvent,
} from "@/lib/data/opportunity-stage-history"
import { Money } from "@/lib/money"
import type {
  OpportunityRecord,
  OpportunityListResult,
  BusinessUnitOption,
  EntityScopeOption,
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
  EntityScopeOption,
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
    primaryContactName: (data.primary_contact_name as string) ?? null,
    stage: data.stage as DealStage,
    probabilityPct: Number(data.probability_pct ?? 0),
    amount,
    currency,
    ownerUserId: data.owner_user_id as string,
    ownerName: owner?.full_name ?? null,
    salesUnitId: data.sales_unit_id as string,
    revenueRecognitionUnitId: (data.revenue_recognition_unit_id as string) ?? null,
    billingEntityId: (data.billing_entity_id as string) ?? null,
    billingEntityName: (data.billing_entity as { name: string } | null)?.name ?? null,
    entitySalesId: (data.entity_sales_id as string) ?? null,
    entitySalesName: (data.entity_sales as { name: string } | null)?.name ?? null,
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

/**
 * Owner-scope for the opportunities list. Applied as an ADDITIONAL narrowing
 * filter on top of RLS — it can only ever remove rows the caller could already
 * see, never widen access.
 *
 * - "all"  (default): every opportunity visible to the caller under RLS — the
 *   org-wide Opportunities list.
 * - "mine": only opportunities the caller owns (owner_user_id = me) — the
 *   personal Pipeline board.
 *
 * Extension seam: a future "team" scope (owners within the caller's reporting
 * line via users.manager_user_id) slots in as one more branch in
 * `applyScopeFilter` below — resolve the report ids and add
 * `.in("owner_user_id", reportIds)`. Kept as a string-literal union so adding a
 * member is a small, localized, type-checked change.
 */
export type OpportunityScope = "mine" | "all"

export interface OpportunityListParams {
  scope?: OpportunityScope
  /**
   * Optional inclusive `close_date` lower bound (`YYYY-MM-DD`). Like `scope`,
   * this only ever NARROWS the RLS-visible set — it never widens access. Used by
   * the "Closing This Month" preset; deals with a null close_date are excluded.
   */
  closeDateFrom?: string
  /** Optional inclusive `close_date` upper bound (`YYYY-MM-DD`). */
  closeDateTo?: string
  /**
   * Optional selling-entity filter (`entity_sales_id`). Like `scope` and the
   * close-date window, this only ever NARROWS the RLS-visible set — an `.eq` on
   * a single entity can never surface a row the caller couldn't already see.
   * Backs the ORR-717 entity-scope chips; deals with a null entity are excluded.
   */
  entityId?: string
}

export async function getOpportunities(
  ctx: OpportunityCallContext,
  params: OpportunityListParams = {},
): Promise<OpportunityListResult> {
  const supabase = await createServerClient()
  const scope: OpportunityScope = params.scope ?? "all"

  let query = supabase
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

  // Owner-scope narrowing. Additional filter ON TOP of RLS — never widens access.
  if (scope === "mine") {
    query = query.eq("owner_user_id", ctx.user.id)
  }
  // Future: else if (scope === "team") {
  //   const reportIds = await getReportUserIds(ctx) // via users.manager_user_id
  //   query = query.in("owner_user_id", reportIds)
  // }

  // Close-date window (e.g. "Closing This Month"). Also a pure narrowing filter;
  // rows with a null close_date fall outside the range and are excluded.
  if (params.closeDateFrom) {
    query = query.gte("close_date", params.closeDateFrom)
  }
  if (params.closeDateTo) {
    query = query.lte("close_date", params.closeDateTo)
  }

  // Entity-scope narrowing (ORR-717). A single-value `.eq` on entity_sales_id —
  // pure narrowing, never widens. The entity id is validated against the
  // caller's own derived options upstream, so a stale/foreign id here would at
  // worst return an empty list, never leak.
  if (params.entityId) {
    query = query.eq("entity_sales_id", params.entityId)
  }

  const { data, error, count } = await query.order("updated_at", {
    ascending: false,
  })

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
      owner:owner_user_id ( full_name ),
      billing_entity:billing_entity_id ( name ),
      entity_sales:entity_sales_id ( name )
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

  // primary_contact_id has no FK to contacts (so it can't be a PostgREST embed —
  // that was the #208 crash); resolve the contact name in a separate RLS-scoped
  // read and graft it on so the UI shows a name, never a raw id.
  const row = data as Record<string, unknown>
  if (row.primary_contact_id) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("full_name")
      .eq("id", row.primary_contact_id as string)
      .maybeSingle()
    row.primary_contact_name = (contact as { full_name: string } | null)?.full_name ?? null
  }

  return toDomainOpportunity(row)
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

/**
 * Entity-scope chip options for the Opportunities surface (ORR-717).
 *
 * SEAM — Option A (ratified O4): the options auto-derive from the caller's
 * RLS-visible deals via `list_visible_sales_entities()`, a SECURITY INVOKER
 * function that takes the DISTINCT selling entity across the caller's own
 * visible opportunities. Because the set is built from rows the caller can
 * already see, "options ⊆ All Deals" holds by construction, and the RPC does
 * the DISTINCT server-side so a >1000-deal pipeline can't truncate the list.
 *
 * To move to Option B ("entities the caller's ROLE grants") later, swap the RPC
 * for a role/region query — this function's signature and every caller stay the
 * same, so it is an isolated substitution.
 */
export async function getEntityScopeOptions(
  ctx: OpportunityCallContext,
): Promise<EntityScopeOption[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase.rpc("list_visible_sales_entities")

  if (error) {
    throw new Error(`Failed to load entity-scope options: ${error.message}`)
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
    .insert(dbData as never)
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

// Phase 3c: EVERY opportunity must have an approved approval before it can be
// moved to Closed Won. Uses a SECURITY DEFINER helper so the check is correct
// regardless of whether the closer can see the approval under RLS.
async function assertClosedWonApprovalGate(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  opportunityId: string,
  fromStage: string,
  toStage: string,
): Promise<void> {
  if (toStage !== "closed_won" || fromStage === "closed_won") return
  const { data, error } = await supabase.rpc("opportunity_has_approved_approval", {
    _opportunity_id: opportunityId,
  })
  if (error) {
    throw new Error(`Failed to check approval status: ${error.message}`)
  }
  if (!data) {
    throw new Error(
      "This opportunity must have an approved approval before it can be moved to Closed Won.",
    )
  }
}

async function assertEnforceGateApproval(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  opportunityId: string,
  fromStage: string,
  toStage: string,
): Promise<void> {
  if (STAGE_ORDER[toStage as DealStage] <= STAGE_ORDER[fromStage as DealStage]) return
  const { data, error } = await supabase.rpc("opportunity_check_enforce_gate", {
    _opportunity_id: opportunityId,
    _to_stage: toStage as DealStage,
  })
  if (error) {
    throw new Error(`Failed to check approval gate: ${error.message}`)
  }
  if (!data) {
    throw new Error(
      "This stage advance requires an approved approval. Please submit and obtain approval before continuing.",
    )
  }
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

  if (parsed.stage !== undefined) {
    await assertClosedWonApprovalGate(supabase, id, existing.stage, parsed.stage)
    await assertEnforceGateApproval(supabase, id, existing.stage, parsed.stage)
  }

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
      .update(dbData as never)
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to update opportunity: ${error.message}`)
    }
  }

  const updated = await getOpportunityById(ctx, id)
  if (!updated) throw new Error("Opportunity not found after update")

  // A stage change made through the general update path must record history and
  // notify, exactly like the dedicated updateOpportunityStage. Otherwise a stage
  // moved via the full-edit form silently skips the audit trail + notification.
  if (parsed.stage !== undefined && parsed.stage !== existing.stage) {
    const toStage = parsed.stage
    const event = determineStageEvent(existing.stage, toStage)

    try {
      await insertStageHistoryEntry(ctx, {
        opportunityId: id,
        fromStage: existing.stage,
        toStage,
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
        toStage,
        event,
        ownerUserId: existing.ownerUserId ?? ctx.user.id,
      }),
    )
  }

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
    await assertClosedWonApprovalGate(supabase, id, existing.stage, parsed.stage)
    await assertEnforceGateApproval(supabase, id, existing.stage, parsed.stage)

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

  const { data: rows, error: fetchError } = await supabase
    .from("opportunities")
    .select("id, stage")
    .in("id", parsed.ids)
  if (fetchError) {
    throw new Error(`Failed to load opportunities for bulk stage update: ${fetchError.message}`)
  }

  for (const row of (rows ?? []) as { id: string; stage: string }[]) {
    if (row.stage === parsed.stage) continue
    await assertClosedWonApprovalGate(supabase, row.id, row.stage, parsed.stage)
    await assertEnforceGateApproval(supabase, row.id, row.stage, parsed.stage)
  }

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

  // Atomic replace (delete + insert in one transaction) — a partial failure must
  // never leave the deal with zero splits (which also drops split-unit-manager
  // visibility). See replace_opportunity_splits.
  const { error } = await supabase.rpc("replace_opportunity_splits", {
    _opportunity_id: opportunityId,
    _rows: parsed.splits.map((s) => ({
      sales_unit_id: s.salesUnitId,
      user_id: s.userId ?? null,
      pct: s.pct,
      notes: s.notes ?? null,
    })),
  })

  if (error) {
    throw new Error(`Failed to replace opportunity splits: ${error.message}`)
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

  // Atomic replace — a partial failure must never empty the team (which also
  // drops team + manager visibility). added_by is stamped from auth.uid() inside
  // the RPC. See replace_opportunity_team_members.
  const { error } = await supabase.rpc("replace_opportunity_team_members", {
    _opportunity_id: opportunityId,
    _rows: parsed.members.map((m) => ({
      user_id: m.userId,
      role: m.role,
    })),
  })

  if (error) {
    throw new Error(`Failed to replace opportunity team members: ${error.message}`)
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
