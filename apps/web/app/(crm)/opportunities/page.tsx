import { redirect } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
  getUserOptions,
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
import { generateOpportunityAction, extractDocumentTextAction } from "./generate-actions"

/**
 * Unified Opportunities surface (ORR-711). One route, two orthogonal controls:
 * the Scope chips (My Pipeline / All Deals / Closing This Month) and the View
 * axis (Board/Table), both persisted in the URL. The old /pipeline route folded
 * into here — "My Pipeline · Board" is the default landing.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; view?: string }>
}) {
  const sp = await searchParams
  const scopeKey = parseScopeKey(sp.scope)
  // eslint-disable-next-line security/detect-object-injection -- scopeKey is a validated OpportunityScopeKey union from parseScopeKey, not raw input
  const preset = SCOPE_PRESETS[scopeKey]

  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const preferences = await getUserPreferences(ctx)

  // Build the scoped query. Owner-scope + (for "Closing This Month") a close_date
  // window resolved in the user's timezone. Both only narrow within RLS.
  const listParams: OpportunityListParams = { scope: preset.ownerScope }
  if (preset.closingThisMonth) {
    const { from, to } = currentMonthRange(preferences.timezone)
    listParams.closeDateFrom = from
    listParams.closeDateTo = to
  }

  const [{ opportunities: rawOpportunities }, accounts, businessUnits, userOptions, savedViews] =
    await Promise.all([
      getOpportunities(ctx, listParams),
      getAccountOptions(ctx),
      getBusinessUnitOptions(ctx),
      getUserOptions(ctx),
      listSavedViews(ctx, preset.savedViewScope),
    ])

  // G3: a user who owns no deals (e.g. an admin) landing on the implicit default
  // (My Pipeline) would see an empty board. Bounce them to All Deals · Table.
  // Only on the IMPLICIT default — an explicit ?scope=my-pipeline shows the
  // empty state instead.
  if (sp.scope == null && scopeKey === "my-pipeline" && rawOpportunities.length === 0) {
    redirect("/opportunities?scope=all-deals&view=table")
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
      opportunities={opportunities}
      stageTotals={stageTotals}
      accounts={accounts}
      businessUnits={businessUnits}
      users={users}
      createAction={createOpportunityAction}
      generateAction={generateOpportunityAction}
      extractFileAction={extractDocumentTextAction}
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
