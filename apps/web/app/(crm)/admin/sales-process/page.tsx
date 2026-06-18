import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getPipelineStagesAction,
  getLossReasonsAction,
  getProjectTypesAction,
  getRevenueCategoriesAction,
  getStageGateRulesAction,
} from "./actions"
import { SalesProcessConfigClient } from "@/components/admin/sales-process-config-client"

export default async function AdminSalesProcessPage() {
  const user = await requireUser()
  requireRole(user, "admin")

  const [pipelineStages, lossReasons, projectTypes, revenueCategories, stageGateRules] =
    await Promise.all([
      getPipelineStagesAction(),
      getLossReasonsAction(),
      getProjectTypesAction(),
      getRevenueCategoriesAction(),
      getStageGateRulesAction(),
    ])

  return (
    <SalesProcessConfigClient
      pipelineStages={pipelineStages}
      lossReasons={lossReasons}
      projectTypes={projectTypes}
      revenueCategories={revenueCategories}
      stageGateRules={stageGateRules}
    />
  )
}
