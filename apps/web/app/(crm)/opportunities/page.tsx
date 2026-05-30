import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
import { OpportunitiesView } from "@/components/opportunities/opportunities-view"
import {
  createOpportunityAction,
  updateOpportunityStageAction,
  bulkDeleteOpportunitiesAction,
  bulkUpdateOpportunityStageAction,
} from "./actions"

interface OpportunitiesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const { page: pageRaw, limit: limitRaw } = await searchParams
  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1)
  const limit = Math.max(1, Math.min(100, parseInt(limitRaw ?? "50", 10) || 50))
  const offset = (page - 1) * limit

  const [{ opportunities, totalCount }, accounts, businessUnits] = await Promise.all([
    getOpportunities(ctx, { limit, offset }),
    getAccountOptions(ctx),
    getBusinessUnitOptions(ctx),
  ])

  return (
    <OpportunitiesView
      opportunities={opportunities}
      totalCount={totalCount}
      page={page}
      limit={limit}
      accounts={accounts}
      businessUnits={businessUnits}
      createAction={createOpportunityAction}
      updateStageAction={updateOpportunityStageAction}
      bulkDeleteAction={bulkDeleteOpportunitiesAction}
      bulkUpdateStageAction={bulkUpdateOpportunityStageAction}
    />
  )
}
