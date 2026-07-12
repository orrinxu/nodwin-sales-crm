import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
  getUserOptions,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
import { getUserPreferences } from "@/lib/data/user-preferences"
import { getStageTotals } from "@/lib/data/stage-totals"
import { attachDealHealth } from "@/lib/data/deal-health"
import { listSavedViews } from "@/lib/data/saved-views"
import { OpportunitiesView } from "@/components/opportunities/opportunities-view"
import type { EntityOption } from "@/components/entity-combobox"
import {
  createOpportunityAction,
  updateOpportunityStageAction,
  bulkDeleteOpportunitiesAction,
  bulkUpdateOpportunityStageAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  saveViewAction,
  deleteSavedViewAction,
} from "./actions"
import { generateOpportunityAction, extractDocumentTextAction } from "./generate-actions"

export default async function OpportunitiesPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [{ opportunities: rawOpportunities }, accounts, businessUnits, userOptions, preferences, savedViews] = await Promise.all([
    getOpportunities(ctx, { scope: "all" }),
    getAccountOptions(ctx),
    getBusinessUnitOptions(ctx),
    getUserOptions(ctx),
    getUserPreferences(ctx),
    listSavedViews(ctx, "all"),
  ])

  // Attach batched deal-card health signals (overdue / stale) — one RPC for the
  // whole scoped list, never per-card.
  const opportunities = await attachDealHealth(ctx, rawOpportunities)

  const users: EntityOption[] = userOptions.map((u) => ({
    id: u.id,
    name: u.fullName,
  }))

  // FX-normalised per-stage board totals over the scoped ("all") list.
  const stageTotals = await getStageTotals(ctx, opportunities)

  // Entry default: explicit entry_currency_default, else "match display", else USD.
  const defaultCurrency =
    preferences.entryCurrencyDefault ?? preferences.displayCurrency ?? "USD"

  return (
      <OpportunitiesView
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
        defaultCurrency={defaultCurrency}
        defaultView="table"
        title="Opportunities"
        description="All deals across the group you can access."
        savedViews={savedViews}
        savedViewScope="all"
        saveViewAction={saveViewAction}
        deleteSavedViewAction={deleteSavedViewAction}
      />
  )
}
