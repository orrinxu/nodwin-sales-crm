import { redirect } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
  getUserOptions,
  getEntityScopeOptions,
  type OpportunityListParams,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
import { getUserPreferences } from "@/lib/data/user-preferences"
import { getStageTotals } from "@/lib/data/stage-totals"
import { attachDealHealth } from "@/lib/data/deal-health"
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
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; view?: string; entity?: string; create?: string }>
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

  // Build the scoped query. Owner-scope + (for "Closing This Month") a close_date
  // window resolved in the user's timezone + (optional) an entity narrowing. All
  // three only narrow within RLS.
  const listParams: OpportunityListParams = { scope: preset.ownerScope }
  if (preset.closingThisMonth) {
    const { from, to } = currentMonthRange(preferences.timezone)
    listParams.closeDateFrom = from
    listParams.closeDateTo = to
  }
  if (activeEntity) {
    listParams.entityId = activeEntity
  }

  const [{ opportunities: rawOpportunities }, accounts, businessUnits, userOptions, savedViews, voiceEnabled] =
    await Promise.all([
      getOpportunities(ctx, listParams),
      getAccountOptions(ctx),
      getBusinessUnitOptions(ctx),
      getUserOptions(ctx),
      listSavedViews(ctx, preset.savedViewScope),
      isTranscriptionAvailable(),
    ])

  // G3: a user who owns no deals (e.g. an admin) landing on the implicit default
  // (My Pipeline) would see an empty board. Bounce them to All Deals · Table.
  // Only on the IMPLICIT default — an explicit ?scope=my-pipeline shows the
  // empty state instead.
  if (sp.scope == null && scopeKey === "my-pipeline" && rawOpportunities.length === 0) {
    const to = new URLSearchParams({ scope: "all-deals", view: "table" })
    if (activeEntity) to.set("entity", activeEntity)
    // Preserve the launcher's create flag so "New opportunity" still opens the
    // generator even when the rep has no deals and gets bounced to All Deals.
    if (sp.create) to.set("create", sp.create)
    redirect(`/opportunities?${to.toString()}`)
  }

  // Attach batched deal-card health signals (overdue / stale) — one RPC for the
  // whole scoped list, never per-card.
  const opportunities = await attachDealHealth(ctx, rawOpportunities)

  const users: EntityOption[] = userOptions.map((u) => ({
    id: u.id,
    name: u.fullName,
  }))

  // FX-normalised per-stage board totals over the scoped list.
  const stageTotals = await getStageTotals(ctx, opportunities)

  // Entry default: explicit entry_currency_default, else "match display", else USD.
  const defaultCurrency =
    preferences.entryCurrencyDefault ?? preferences.displayCurrency ?? "USD"

  const view = parseViewKey(sp.view) ?? preset.defaultView

  return (
    <OpportunitiesView
      scope={scopeKey}
      entityOptions={entityOptions}
      activeEntity={activeEntity ?? null}
      opportunities={opportunities}
      stageTotals={stageTotals}
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
