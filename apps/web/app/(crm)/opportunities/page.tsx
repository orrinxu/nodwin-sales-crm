import { requireUser } from "@/lib/security/auth"
import {
  getOpportunities,
  getBusinessUnitOptions,
} from "@/lib/data/opportunities"
import { getAccountOptions } from "@/lib/data/contacts"
import {
  getStageLabelMap,
  getLossReasons,
} from "@/lib/data/sales-process-config"
import type { SalesProcessCallContext } from "@/lib/data/sales-process-config"
import { OpportunitiesView } from "@/components/opportunities/opportunities-view"
import {
  createOpportunityAction,
  updateOpportunityStageAction,
  bulkDeleteOpportunitiesAction,
  bulkUpdateOpportunityStageAction,
} from "./actions"

export default async function OpportunitiesPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const spCtx: SalesProcessCallContext = { user, source: "web" }

  const [{ opportunities }, accounts, businessUnits, stageLabels, lossReasons] = await Promise.all([
    getOpportunities(ctx),
    getAccountOptions(ctx),
    getBusinessUnitOptions(ctx),
    getStageLabelMap(),
    getLossReasons(spCtx),
  ])

  return (
    <OpportunitiesView
      opportunities={opportunities}
      accounts={accounts}
      businessUnits={businessUnits}
      stageLabels={stageLabels}
      lossReasons={lossReasons.map((r) => ({ id: r.id, label: r.label }))}
      createAction={createOpportunityAction}
      updateStageAction={updateOpportunityStageAction}
      bulkDeleteAction={bulkDeleteOpportunitiesAction}
      bulkUpdateStageAction={bulkUpdateOpportunityStageAction}
    />
  )
}
