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
} from "../opportunities/actions"
import { generateOpportunityAction, extractDocumentTextAction } from "../opportunities/generate-actions"

export const metadata = {
  title: "Pipeline - Nodwin CRM",
}

export default async function PipelinePage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  // Pipeline = the current user's OWN deals (owner_user_id = me). The "mine"
  // scope is an additional narrowing filter on top of RLS.
  const [{ opportunities: rawOpportunities }, accounts, businessUnits, userOptions, preferences, savedViews] = await Promise.all([
    getOpportunities(ctx, { scope: "mine" }),
    getAccountOptions(ctx),
    getBusinessUnitOptions(ctx),
    getUserOptions(ctx),
    getUserPreferences(ctx),
    listSavedViews(ctx, "mine"),
  ])

  // Attach batched deal-card health signals (overdue / stale) — one RPC for the
  // whole scoped list, never per-card.
  const opportunities = await attachDealHealth(ctx, rawOpportunities)

  const users: EntityOption[] = userOptions.map((u) => ({
    id: u.id,
    name: u.fullName,
  }))

  // FX-normalised per-stage board totals over the scoped ("mine") list.
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
        defaultView="board"
        title="Pipeline"
        description="Your deals — the ones you own. Drag between stages to update status."
        savedViews={savedViews}
        savedViewScope="mine"
        saveViewAction={saveViewAction}
        deleteSavedViewAction={deleteSavedViewAction}
        emptyState={{
          title: "You don't own any deals yet",
          description:
            "Deals you own show up here as your personal working board. Create one to get started.",
        }}
      />
  )
}
