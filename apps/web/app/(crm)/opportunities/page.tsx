import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
import { OpportunityBoard } from "@/components/opportunities/opportunity-board"
import { createOpportunityAction, updateOpportunityStageAction } from "./actions"

export default async function OpportunitiesPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [{ opportunities }, accounts, businessUnits] = await Promise.all([
    getOpportunities(ctx),
    getAccountOptions(ctx),
    getBusinessUnitOptions(ctx),
  ])

  return (
    <OpportunityBoard
      opportunities={opportunities}
      accounts={accounts}
      businessUnits={businessUnits}
      createAction={createOpportunityAction}
      updateStageAction={updateOpportunityStageAction}
    />
  )
}
