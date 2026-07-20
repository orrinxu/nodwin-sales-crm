import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES, STAGE_ORDER, isTerminalStage, type DealStage } from "@/lib/opportunity"
import { todayInTimeZone } from "@/lib/opportunity/scope-presets"
import {
  insertStageHistoryEntry,
  determineStageEvent,
} from "@/lib/data/opportunity-stage-history"
import { getUserPreferences } from "@/lib/data/user-preferences"
import { Money } from "@/lib/money"
import {
  clampPage,
  clampPageSize,
  rangeFor,
  sanitizeSearchTerm,
  MAX_PAGE_SIZE,
  BOARD_FETCH_CAP,
} from "@/lib/list/pagination"
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

// Cap on the account-name search pre-resolution. A search box is meant to
// narrow — if a term matches more accounts than this the user should refine it,
// and capping keeps the `account_id.in.(…)` list (and the pre-query) bounded.
const ACCOUNT_SEARCH_MATCH_CAP = 200

// Guards the account ids before they're interpolated into the `.or()` filter
// string — the ids come from the DB so this is belt-and-braces, not the primary
// defence.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

/**
 * Columns the server-driven list can sort by (ORR-755). Mapped to a concrete
 * DB order in `applyOpportunitySort`. `account` and `owner` sort on the
 * DENORMALIZED top-level `account_name` / `owner_name` columns (see ORR-800 note
 * on `applyOpportunitySort`), NOT the embedded relation; `amount` sorts on the
 * RAW numeric column (a cross-currency approximation — the same rough order the
 * old client sort used, since FX-exact ordering would need per-row conversion
 * the DB can't do cheaply).
 */
export type OpportunitySortColumn =
  | "name"
  | "account"
  | "stage"
  | "amount"
  | "owner"
  | "closeDate"

export const OPPORTUNITY_SORT_COLUMNS: readonly OpportunitySortColumn[] = [
  "name",
  "account",
  "stage",
  "amount",
  "owner",
  "closeDate",
] as const

export interface OpportunitySort {
  column: OpportunitySortColumn
  direction: "asc" | "desc"
}

/** Owner filter sentinel for deals with no owner (mirrors the table UI). */
export const OPPORTUNITY_UNASSIGNED_OWNER = "__unassigned__"

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
  /**
   * Free-text search (ORR-755). Case-insensitive substring match on the deal
   * NAME or its ACCOUNT name — the account match is resolved to account ids
   * first so the two can be OR'd in one bounded query. Sanitised before it
   * reaches the PostgREST filter string.
   */
  search?: string
  /** Single-stage filter; omitted / "all" means every stage. */
  stageFilter?: string
  /**
   * Owner filter (`owner_user_id`). `OPPORTUNITY_UNASSIGNED_OWNER` selects deals
   * with no owner; omitted / "all" means every owner.
   */
  ownerFilter?: string
  /** Sort column + direction; defaults to `updated_at` DESC when omitted. */
  sort?: OpportunitySort
  /** 1-based page index (server-driven pagination). Defaults to 1. */
  page?: number
  /** Rows per page. Clamped to `[1, maxPageSize]`; defaults to `DEFAULT_PAGE_SIZE`. */
  pageSize?: number
  /**
   * Optional explicit ceiling for `pageSize` (ORR-805). Defaults to
   * `MAX_PAGE_SIZE` (100) for normal list callers. The kanban board can't
   * paginate, so it opts into a larger bounded fetch by passing
   * `BOARD_FETCH_CAP` (500) here — otherwise `clampPageSize` silently caps its
   * card fetch at 100 and drops deals the ORR-755 design meant to show. The
   * value is itself clamped to `[1, BOARD_FETCH_CAP]`, so a caller can never
   * re-introduce the unbounded fetch. See ORR-762 (at-scale re-check): staging
   * data was too small to trip this.
   */
  maxPageSize?: number
}

const OPPORTUNITY_LIST_SELECT = `
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
      account_name,
      owner_name,
      created_at,
      updated_at,
      account:account_id ( name ),
      owner:owner_user_id ( full_name )
    `

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the PostgREST builder type is opaque across .order() chaining; the shape is preserved.
function applyOpportunitySort(query: any, sort: OpportunitySort | undefined): any {
  // Every branch appends `.order("id")` as a stable, unique tiebreaker. Without
  // it, rows tying on the primary sort key have no defined order, so `.range()`
  // pagination can duplicate/skip them across pages (ORR-800; the broader
  // tiebreaker sweep is ORR-790). `id` is the PK — unique and always present.
  if (!sort) {
    return query
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
  }
  const ascending = sort.direction === "asc"
  switch (sort.column) {
    case "name":
      return query.order("name", { ascending }).order("id", { ascending: true })
    case "stage":
      return query.order("stage", { ascending }).order("id", { ascending: true })
    case "amount":
      return query.order("amount", { ascending }).order("id", { ascending: true })
    case "closeDate":
      // Nulls last regardless of direction so blank close dates sink to the end.
      return query
        .order("close_date", { ascending, nullsFirst: false })
        .order("id", { ascending: true })
    case "account":
    case "owner":
      // ORR-800: sort on the DENORMALIZED top-level `account_name` / `owner_name`
      // columns — NOT the embedded relation. Ordering through the embed only
      // affects the parent with `!inner`, but `!inner` inner-joins accounts /
      // users UNDER RLS: those SELECT policies are narrow (accounts =
      // owner/creator/admin; users = self/same-entity/admin), whereas the
      // opportunity_visibility model grants access across entities. So a deal you
      // can legitimately see whose account/owner row you CANNOT see would be
      // silently dropped from the sorted+paginated result — the exact
      // missing-rows class this ticket fixes. The denormalized columns live on
      // the opportunity row itself (which RLS already lets you read) and are kept
      // current by triggers + backfill (migration 20260719020000). Nulls last so
      // any un-backfilled row sinks rather than reordering the visible set.
      return query
        .order(sort.column === "account" ? "account_name" : "owner_name", {
          ascending,
          nullsFirst: false,
        })
        .order("id", { ascending: true })
    default:
      return query
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
  }
}

export async function getOpportunities(
  ctx: OpportunityCallContext,
  params: OpportunityListParams = {},
): Promise<OpportunityListResult> {
  const supabase = await createServerClient()
  const scope: OpportunityScope = params.scope ?? "all"
  const page = clampPage(params.page)
  // Resolve the pageSize ceiling. Normal list callers get MAX_PAGE_SIZE (100);
  // the board opts into a larger bounded fetch by passing
  // maxPageSize = BOARD_FETCH_CAP (ORR-805). An explicit ceiling is itself
  // clamped to [1, BOARD_FETCH_CAP] so a caller can never re-introduce the
  // unbounded fetch. Feed the SAME ceiling to rangeFor below, or its
  // belt-and-suspenders re-clamp drops the board's 500 back to 100.
  const maxPageSize =
    params.maxPageSize == null
      ? MAX_PAGE_SIZE
      : Math.min(Math.max(1, Math.floor(params.maxPageSize)), BOARD_FETCH_CAP)
  const pageSize = clampPageSize(params.pageSize, maxPageSize)

  let query = supabase
    .from("opportunities")
    .select(OPPORTUNITY_LIST_SELECT, { count: "exact" })

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

  // Stage filter (server-side; the old client-side useMemo filter is gone). The
  // value is a UI-provided string; a non-stage value simply matches no rows.
  if (params.stageFilter && params.stageFilter !== "all") {
    query = query.eq("stage", params.stageFilter as DealStage)
  }

  // Owner filter. The unassigned sentinel maps to an IS NULL; any other value is
  // a straight equality. Both only narrow.
  if (params.ownerFilter && params.ownerFilter !== "all") {
    if (params.ownerFilter === OPPORTUNITY_UNASSIGNED_OWNER) {
      query = query.is("owner_user_id", null)
    } else {
      query = query.eq("owner_user_id", params.ownerFilter)
    }
  }

  // Free-text search over deal name OR account name. Account name lives on the
  // embedded `accounts` row, which PostgREST can't OR against the parent in one
  // filter, so resolve matching account ids first (RLS-scoped, bounded) and fold
  // them into a single `.or(name.ilike, account_id.in.(…))`. The term is
  // sanitised so its punctuation can't corrupt the or-filter syntax.
  const search = sanitizeSearchTerm(params.search)
  if (search) {
    const { data: matchedAccounts } = await supabase
      .from("accounts")
      .select("id")
      // Order before capping so the 200-account slice is deterministic — an
      // unordered LIMIT can return a different subset on each identical search,
      // making the same query show different deals run to run.
      .order("name", { ascending: true })
      .limit(ACCOUNT_SEARCH_MATCH_CAP)
    const accountIds = ((matchedAccounts ?? []) as { id: string }[])
      .map((a) => a.id)
      .filter((id) => UUID_RE.test(id))

    if (accountIds.length > 0) {
      query = query.or(
        `name.ilike.%${search}%,account_id.in.(${accountIds.join(",")})`,
      )
    } else {
      query = query.ilike("name", `%${search}%`)
    }
  }

  query = applyOpportunitySort(query, params.sort)

  const [from, to] = rangeFor(page, pageSize, maxPageSize)
  const { data, error, count } = await query.range(from, to)

  if (error) {
    throw new Error(`Failed to load opportunities: ${error.message}`)
  }

  const opportunities = (data ?? []).map(toDomainOpportunity)
  const totalCount = count ?? 0

  return { opportunities, totalCount, page, pageSize }
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
  // Stored as a comma-joined list of ISO country codes. The picker offers 33
  // countries → the joined string can exceed 100 chars, so the cap must clear the
  // full selection (was max(100) → a full pick failed server-side with a redacted
  // error). country_execution is a `text` column, so 500 is well within bounds.
  countryExecution: z.string().max(500).optional().or(z.literal("")),
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
  // Set only by the Salesforce importer (ORR-699) to make re-imports idempotent.
  legacySalesforceId: z.string().max(64).nullable().optional(),
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
  .extend({
    // ORR-806: On the create schema an empty/zero amount or barter collapses to
    // `undefined` so an absent field just takes the default. On the partial
    // UPDATE schema that is wrong: `undefined` means "leave this column alone",
    // so a user who clears the field would silently keep the old value. Preserve
    // an explicit cleared value here instead — `amount` clears to 0 (its column
    // is NOT NULL DEFAULT 0), and `barterValue` clears to "" which the apply
    // path below maps to NULL.
    amount: z.preprocess(
      (val) => {
        if (val === undefined) return undefined
        if (val === "" || val === 0 || val === "0") return "0"
        return String(val)
      },
      z.string().optional(),
    ),
    barterValue: z.preprocess(
      (val) => {
        if (val === undefined) return undefined
        if (val === "" || val === 0) return ""
        return String(val)
      },
      z.string().optional(),
    ),
  })
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
  if (parsed.legacySalesforceId) {
    dbData.legacy_salesforce_id = parsed.legacySalesforceId
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
        entityId: opportunity.entitySalesId ?? undefined,
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
  // ORR-803(a): moving to closed_lost is ALWAYS allowed — a loss must remain
  // recordable regardless of approval, mirroring check_stage_transition and the
  // matching exemption in opportunity_check_enforce_gate. Without this, because
  // closed_lost has the highest ordinal it "passes" every enforce-gate workflow's
  // trigger stage, so an unapproved deal could never be marked lost (and if the
  // approval were rejected, never at all).
  if (toStage === "closed_lost") return
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

// ORR-803(d): staleness. An approval is granted against a specific amount and
// governing (sales-unit) entity; once either changes materially — or the deal is
// reopened out of a closed stage — that approval no longer reflects what would be
// approved, yet both the closed-won and enforce gates are EXISTS-any-approved and
// would keep passing on it. A material change must therefore invalidate the
// standing approval so a fresh one is required before the deal can close again.
const MATERIAL_AMOUNT_CHANGE_RATIO = 0.05

function isMaterialApprovalChange(
  existing: OpportunityRecord,
  parsed: { amount?: string; salesUnitId?: string; stage?: DealStage },
): boolean {
  // Reopen: leaving a terminal stage back to an open one.
  if (
    parsed.stage !== undefined &&
    isTerminalStage(existing.stage) &&
    !isTerminalStage(parsed.stage)
  ) {
    return true
  }
  // Governing entity change: sales_unit_id resolves the workflow/entity the gates
  // key on (business_units.entity_id), so a change re-routes governance.
  if (parsed.salesUnitId !== undefined && parsed.salesUnitId !== existing.salesUnitId) {
    return true
  }
  // Amount change beyond the threshold (amounts are decimal strings).
  if (parsed.amount !== undefined) {
    const prev = Number(existing.amount)
    const next = Number(parsed.amount)
    const material =
      prev === 0
        ? next !== 0
        : Math.abs(next - prev) / Math.abs(prev) >= MATERIAL_AMOUNT_CHANGE_RATIO
    if (material) return true
  }
  return false
}

// Cancel any standing approved instance for the opportunity via the SECURITY
// DEFINER RPC (authorised by can_manage_opportunity — the same right the editor
// already holds to reach this write path). Throws on a genuine RPC error so a
// silent staleness leak can't slip through.
async function invalidateStaleApprovals(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  opportunityId: string,
): Promise<void> {
  const { error } = await supabase.rpc("invalidate_opportunity_approvals", {
    _opportunity_id: opportunityId,
  })
  if (error) {
    throw new Error(`Failed to invalidate stale approvals: ${error.message}`)
  }
}

// ORR-797: The actual close date a deal earns when it transitions into a closed
// stage (closed_won/closed_lost). Resolved in the caller's timezone (falling back
// to the server's ambient zone when they have none set) so a deal moved to Closed
// Won late in the day lands on the right calendar day — and therefore the right
// forecast quarter, scorecard period, and quota window, all of which filter
// won/lost deals by close_date. Overwrite policy: on an actual close we stamp
// today, replacing any pre-filled *expected* close date, because the realised
// close date is what drives revenue recognition and the rollups above.
async function resolveCloseDate(ctx: OpportunityCallContext): Promise<string> {
  const prefs = await getUserPreferences(ctx)
  return todayInTimeZone(prefs.timezone)
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

  // ORR-803(d): a material change (amount/entity/reopen) invalidates any standing
  // approval FIRST — before the gates run — so that an edit which both bumps the
  // amount and moves the deal to Closed Won correctly re-gates on the now-stale
  // approval instead of sliding through on it.
  if (isMaterialApprovalChange(existing, parsed)) {
    await invalidateStaleApprovals(supabase, id)
  }

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
  // ORR-806: an explicitly emptied multi-select clears the column (mirrors the
  // account email_domains []→NULL convention) rather than writing an empty array.
  if (parsed.serviceType !== undefined) dbData.service_type = parsed.serviceType.length > 0 ? parsed.serviceType : null
  if (parsed.propertyType !== undefined) dbData.property_type = parsed.propertyType || null
  if (parsed.barterValue !== undefined) dbData.barter_value = parsed.barterValue || null
  if (parsed.probabilityPct !== undefined) dbData.probability_pct = parsed.probabilityPct
  if (parsed.visibilityTier !== undefined) dbData.visibility_tier = parsed.visibilityTier || null
  if (parsed.customData !== undefined) dbData.custom_data = parsed.customData

  // ORR-797: A stage change made through the full-edit form must maintain
  // close_date the same way the dedicated stage path does — but only when the
  // same edit isn't already setting close_date explicitly (parsed.closeDate
  // undefined), in which case the user's own value wins. Into a closed stage →
  // stamp today's actual close date; reopen (closed → open) → clear it.
  if (
    parsed.stage !== undefined &&
    parsed.stage !== existing.stage &&
    parsed.closeDate === undefined
  ) {
    if (isTerminalStage(parsed.stage)) {
      dbData.close_date = await resolveCloseDate(ctx)
    } else if (isTerminalStage(existing.stage)) {
      dbData.close_date = null
    }
  }

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("opportunities")
      .update(dbData as never)
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to update opportunity: ${error.message}`)
    }
  }

  // Cascade a deal-currency change onto its cash-flow milestones. Milestone
  // currency is immutable through its own update path, so without this the
  // working-capital P&L derivation throws on a milestone-vs-revenue currency
  // mismatch (deriveWorkingCapital asserts single-currency) on every load until
  // the milestones are recreated. Re-denominate 1:1 — the same label-swap the
  // deal's line items and revenue schedule already get, keeping the P&L usable.
  if (parsed.currency !== undefined && parsed.currency !== existing.currency) {
    const { error: milestoneErr } = await supabase
      .from("cashflow_milestone")
      .update({ currency: parsed.currency } as never)
      .eq("opportunity_id", id)
    if (milestoneErr) {
      throw new Error(
        `Opportunity updated but failed to re-denominate cash-flow milestones: ${milestoneErr.message}`,
      )
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
        entityId: existing.entitySalesId ?? undefined,
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
        entityId: updated.entitySalesId ?? undefined,
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
    // ORR-803(d): a reopen (terminal → open) via the stage path invalidates the
    // standing approval so re-closing later requires fresh sign-off.
    if (isMaterialApprovalChange(existing, { stage: parsed.stage })) {
      await invalidateStaleApprovals(supabase, id)
    }
    await assertClosedWonApprovalGate(supabase, id, existing.stage, parsed.stage)
    await assertEnforceGateApproval(supabase, id, existing.stage, parsed.stage)

    const event = determineStageEvent(existing.stage, parsed.stage)

    // ORR-797: This path (kanban drag / stage-only update) carries no close_date
    // input, so stamp it here. Into a closed stage → set today's actual close
    // date (overwriting any stale expected date). Out of a closed stage back to
    // open (reopen) → clear the now-stale close_date so the deal no longer counts
    // as won/lost in any period.
    const stageUpdate: Record<string, unknown> = { stage: parsed.stage }
    if (isTerminalStage(parsed.stage)) {
      stageUpdate.close_date = await resolveCloseDate(ctx)
    } else if (isTerminalStage(existing.stage)) {
      stageUpdate.close_date = null
    }

    const { error } = await supabase
      .from("opportunities")
      .update(stageUpdate as never)
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
        entityId: existing.entitySalesId ?? undefined,
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

  // ORR-804: also fetch the fields the single-deal path needs to record stage
  // history and fire owner notifications, so bulk closes aren't audit-trail /
  // notification black holes.
  const { data: rows, error: fetchError } = await supabase
    .from("opportunities")
    .select("id, stage, name, owner_user_id, entity_sales_id")
    .in("id", parsed.ids)
  if (fetchError) {
    throw new Error(`Failed to load opportunities for bulk stage update: ${fetchError.message}`)
  }

  type BulkStageRow = {
    id: string
    stage: DealStage
    name: string
    owner_user_id: string | null
    entity_sales_id: string | null
  }

  // Only rows actually changing stage need gating — and only they should have
  // close_date touched (writing to no-op rows would clobber an already-closed
  // deal's real close_date). ORR-797.
  const changed = ((rows ?? []) as BulkStageRow[]).filter(
    (row) => row.stage !== parsed.stage,
  )
  for (const row of changed) {
    await assertClosedWonApprovalGate(supabase, row.id, row.stage, parsed.stage)
    await assertEnforceGateApproval(supabase, row.id, row.stage, parsed.stage)
  }

  const changedIds = changed.map((row) => row.id)
  if (changedIds.length === 0) return

  if (isTerminalStage(parsed.stage)) {
    // ORR-797: Bulk-closing — stamp today's actual close date on every
    // transitioning row so they register in forecast/scorecard/quota rollups.
    const closeDate = await resolveCloseDate(ctx)
    const { error } = await supabase
      .from("opportunities")
      .update({ stage: parsed.stage, close_date: closeDate } as never)
      .in("id", changedIds)
    if (error) {
      throw new Error(`Failed to bulk update opportunity stages: ${error.message}`)
    }
  } else {
    // Moving to an open stage. Apply the stage to every changed row, then clear
    // close_date only on rows that are actually reopening (coming from a terminal
    // stage) — rows advancing between open stages keep any expected close_date.
    const { error } = await supabase
      .from("opportunities")
      .update({ stage: parsed.stage } as never)
      .in("id", changedIds)
    if (error) {
      throw new Error(`Failed to bulk update opportunity stages: ${error.message}`)
    }

    const reopenedIds = changed
      .filter((row) => isTerminalStage(row.stage))
      .map((row) => row.id)
    if (reopenedIds.length > 0) {
      const { error: clearError } = await supabase
        .from("opportunities")
        .update({ close_date: null } as never)
        .in("id", reopenedIds)
      if (clearError) {
        throw new Error(
          `Failed to clear close_date on reopened opportunities: ${clearError.message}`,
        )
      }
    }
  }

  // ORR-804: record stage history + notify owners for every changed row, exactly
  // like the single-deal updateOpportunityStage path. Without this a manager
  // bulk-moving deals to Closed Lost leaves no history rows and sends no owner
  // notifications. Loss reason is intentionally not collected here — this is at
  // parity with the kanban board-drag path (updateOpportunityStage), which also
  // records history + notifies without prompting for a loss reason.
  for (const row of changed) {
    const event = determineStageEvent(row.stage, parsed.stage)
    try {
      await insertStageHistoryEntry(ctx, {
        opportunityId: row.id,
        fromStage: row.stage,
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
  }

  const { notifyStageChange } = await import("../notifications/triggers")
  for (const row of changed) {
    const event = determineStageEvent(row.stage, parsed.stage)
    void notifyStageChange({
      opportunityId: row.id,
      opportunityName: row.name,
      fromStage: row.stage,
      toStage: parsed.stage,
      event,
      ownerUserId: row.owner_user_id ?? ctx.user.id,
      entityId: row.entity_sales_id ?? undefined,
    })
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
