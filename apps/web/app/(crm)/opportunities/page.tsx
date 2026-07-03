import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
  getUserOptions,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
import { getUserPreferences } from "@/lib/data/user-preferences"
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
} from "./actions"

export default async function OpportunitiesPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [{ opportunities }, accounts, businessUnits, userOptions, preferences] = await Promise.all([
    getOpportunities(ctx),
    getAccountOptions(ctx),
    getBusinessUnitOptions(ctx),
    getUserOptions(ctx),
    getUserPreferences(ctx),
  ])

  const users: EntityOption[] = userOptions.map((u) => ({
    id: u.id,
    name: u.fullName,
  }))

  // Entry default: explicit entry_currency_default, else "match display", else USD.
  const defaultCurrency =
    preferences.entryCurrencyDefault ?? preferences.displayCurrency ?? "USD"

  return (
      <OpportunitiesView
        opportunities={opportunities}
        accounts={accounts}
        businessUnits={businessUnits}
        users={users}
        createAction={createOpportunityAction}
        updateStageAction={updateOpportunityStageAction}
        bulkDeleteAction={bulkDeleteOpportunitiesAction}
        bulkUpdateStageAction={bulkUpdateOpportunityStageAction}
        searchAccountsAction={searchAccountsAction}
        searchContactsAction={searchContactsAction}
        searchUsersAction={searchUsersAction}
        createContactQuickAction={createContactQuickAction}
        defaultCurrency={defaultCurrency}
      />
  )
}
