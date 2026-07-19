import { redirect } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
  getUserOptions,
  getEntityScopeOptions,
  OPPORTUNITY_SORT_COLUMNS,
  type OpportunityListParams,
  type OpportunitySort,
  type OpportunitySortColumn,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
import { getUserPreferences } from "@/lib/data/user-preferences"
import { getScopedStageTotals } from "@/lib/data/stage-totals"
import {
  BOARD_FETCH_CAP,
  DEFAULT_PAGE_SIZE,
  clampPage,
} from "@/lib/list/pagination"
import { attachDealHealth } from "@/lib/data/deal-health"
import { attachLineItemsWarning } from "@/lib/data/line-items-requirement"
import { listSavedViews } from "@/lib/data/saved-views"
import { OpportunitiesView } from "@/components/opportunities/opportunities-view"
import type { EntityOption } from "@/components/entity-combobox"
import {
  SCOPE_PRESETS,
  parseScopeKey,
  parseViewKey,
  resolveEntityScope,
  currentMonthRange,
} from "@/lib/opportunity/scope-presets"
import {
  createOpportunityAction,
  updateOpportunityStageAction,
  bulkDeleteOpportunitiesAction,
  bulkUpdateOpportunityStageAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  createAccountQuickAction,
  saveViewAction,
  deleteSavedViewAction,
} from "./actions"
import { generateOpportunityAction, extractDocumentTextAction, transcribeAudioAction } from "./generate-actions"
import { isTranscriptionAvailable } from "@/lib/data/ai-settings"

/**
 * Unified Opportunities surface (ORR-711). One route, two orthogonal controls:
 * the Scope chips (My Pipeline / All Deals / Closing This Month) and the View
 * axis (Board/Table), both persisted in the URL. The old /pipeline route folded
 * into here — "My Pipeline · Board" is the default landing.
 */
/** Parse `?sort=` / `?dir=` into a validated sort, or undefined for the default. */
function parseSort(
  sortParam: string | undefined,
  dirParam: string | undefined,
): OpportunitySort | undefined {
  if (!sortParam) return undefined
  if (!OPPORTUNITY_SORT_COLUMNS.includes(sortParam as OpportunitySortColumn)) {
    return undefined
  }
  return {
    column: sortParam as OpportunitySortColumn,
    direction: dirParam === "asc" ? "asc" : "desc",
  }
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string
    view?: string
    entity?: string
    create?: string
    q?: string
    stage?: string
    owner?: string
    sort?: string
    dir?: string
    page?: string
  }>
}) {
  const sp = await searchParams
  const scopeKey = parseScopeKey(sp.scope)
  // eslint-disable-next-line security/detect-object-injection -- scopeKey is a validated OpportunityScopeKey union from parseScopeKey, not raw input
  const preset = SCOPE_PRESETS[scopeKey]

  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  // Preferences (timezone) + the caller's entity-scope options are both needed
  // before building the scoped query, so fetch them together.
  const [preferences, entityOptions] = await Promise.all([
    getUserPreferences(ctx),
    getEntityScopeOptions(ctx),
  ])

  // Validate ?entity= against the caller's OWN derived options — an unknown id
  // falls back to "All entities" so the filter and the highlighted chip never
  // disagree.
  const activeEntity = resolveEntityScope(sp.entity, entityOptions)

  // Which surface is rendered decides what to fetch (ORR-755): the board pulls a
  // BOUNDED set of cards + accurate scoped totals; the table pulls one paginated,
  // filtered, sorted page. Resolve it up front so the query below matches.
  const view = parseViewKey(sp.view) ?? preset.defaultView

  // Shared scope narrowing for both surfaces: owner-scope + (for "Closing This
  // Month") a close_date window in the user's timezone + (optional) an entity
  // narrowing. All three only narrow within RLS.
  const listParams: OpportunityListParams = { scope: preset.ownerScope }
  if (preset.closingThisMonth) {
    const { from, to } = currentMonthRange(preferences.timezone)
    listParams.closeDateFrom = from
    listParams.closeDateTo = to
  }
  if (activeEntity) {
    listParams.entityId = activeEntity
  }

  const page = clampPage(sp.page ? Number(sp.page) : 1)

  if (view === "board") {
    // Board: cap the card fetch; totals come from the scoped RPC over the full set.
    // maxPageSize lifts getOpportunities' clamp to BOARD_FETCH_CAP for this call
    // only (ORR-805) — without it the fetch is silently capped at 100 and the
    // board drops deals the ORR-755 design meant to render.
    listParams.pageSize = BOARD_FETCH_CAP
    listParams.maxPageSize = BOARD_FETCH_CAP
    listParams.page = 1
  } else {
    // Table: apply the URL-driven search / stage / owner / sort / page.
    listParams.search = sp.q
    listParams.stageFilter = sp.stage
    listParams.ownerFilter = sp.owner
    listParams.sort = parseSort(sp.sort, sp.dir)
    listParams.page = page
    listParams.pageSize = DEFAULT_PAGE_SIZE
  }

  const [listResult, accounts, businessUnits, userOptions, savedViews, voiceEnabled] =
    await Promise.all([
      getOpportunities(ctx, listParams),
      getAccountOptions(ctx),
      getBusinessUnitOptions(ctx),
      getUserOptions(ctx),
      listSavedViews(ctx, preset.savedViewScope),
      isTranscriptionAvailable(),
    ])

  const rawOpportunities = listResult.opportunities

  // G3: a user who owns no deals (e.g. an admin) landing on the implicit default
  // (My Pipeline) would see an empty board. Bounce them to All Deals · Table.
  // Only on the IMPLICIT default — an explicit ?scope=my-pipeline shows the
  // empty state instead.
  if (sp.scope == null && scopeKey === "my-pipeline" && listResult.totalCount === 0) {
    const to = new URLSearchParams({ scope: "all-deals", view: "table" })
    if (activeEntity) to.set("entity", activeEntity)
    // Preserve the launcher's create flag so "New opportunity" still opens the
    // generator even when the rep has no deals and gets bounced to All Deals.
    if (sp.create) to.set("create", sp.create)
    redirect(`/opportunities?${to.toString()}`)
  }

  // Batched, INDEPENDENT enrichments over the fetched list — run in parallel
  // (deal-health RPC, line-items-required flag) plus, for the board, the scoped
  // FX totals over the FULL set (not the bounded cards).
  const [withHealth, withWarning, stageTotals] = await Promise.all([
    attachDealHealth(ctx, rawOpportunities),
    attachLineItemsWarning(ctx, rawOpportunities),
    view === "board"
      ? getScopedStageTotals(ctx, {
          ownerOnly: preset.ownerScope === "mine",
          closeDateFrom: listParams.closeDateFrom,
          closeDateTo: listParams.closeDateTo,
          entityId: activeEntity ?? undefined,
        })
      : Promise.resolve(undefined),
  ])
  // Merge the two per-deal flags (health + needsLineItems) onto one list.
  const warnById = new Map(withWarning.map((o) => [o.id, o.needsLineItems]))
  const opportunities = withHealth.map((o) => ({
    ...o,
    needsLineItems: warnById.get(o.id) ?? false,
  }))

  const users: EntityOption[] = userOptions.map((u) => ({
    id: u.id,
    name: u.fullName,
  }))

  // Entry default: explicit entry_currency_default, else "match display", else USD.
  const defaultCurrency =
    preferences.entryCurrencyDefault ?? preferences.displayCurrency ?? "USD"

  return (
    <OpportunitiesView
      scope={scopeKey}
      entityOptions={entityOptions}
      activeEntity={activeEntity ?? null}
      opportunities={opportunities}
      stageTotals={stageTotals}
      totalCount={listResult.totalCount}
      page={listResult.page}
      pageSize={listResult.pageSize}
      ownerOptions={userOptions.map((u) => ({ id: u.id, name: u.fullName }))}
      accounts={accounts}
      businessUnits={businessUnits}
      users={users}
      createAction={createOpportunityAction}
      generateAction={generateOpportunityAction}
      extractFileAction={extractDocumentTextAction}
      transcribeAction={voiceEnabled ? transcribeAudioAction : undefined}
      updateStageAction={updateOpportunityStageAction}
      bulkDeleteAction={bulkDeleteOpportunitiesAction}
      bulkUpdateStageAction={bulkUpdateOpportunityStageAction}
      searchAccountsAction={searchAccountsAction}
      searchContactsAction={searchContactsAction}
      searchUsersAction={searchUsersAction}
      createContactQuickAction={createContactQuickAction}
      createAccountQuickAction={createAccountQuickAction}
      defaultCurrency={defaultCurrency}
      defaultView={view}
      title={preset.title}
      description={preset.description}
      savedViews={savedViews}
      savedViewScope={preset.savedViewScope}
      saveViewAction={saveViewAction}
      deleteSavedViewAction={deleteSavedViewAction}
      emptyState={preset.emptyState}
    />
  )
}
