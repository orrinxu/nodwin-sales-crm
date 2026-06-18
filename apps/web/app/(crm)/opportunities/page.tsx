import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
  getUserOptions,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
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

  const [{ opportunities }, accounts, businessUnits, userOptions] = await Promise.all([
    getOpportunities(ctx),
    getAccountOptions(ctx),
    getBusinessUnitOptions(ctx),
    getUserOptions(ctx),
  ])

  const users: EntityOption[] = userOptions.map((u) => ({
    id: u.id,
    name: u.fullName,
  }))

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
      />
  )
}
