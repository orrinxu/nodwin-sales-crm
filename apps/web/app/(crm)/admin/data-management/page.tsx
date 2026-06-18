import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFinanceExportConfigs } from "@/lib/data/data-management"
import { getImportJobs } from "@/lib/data/data-management"
import { getAllEntities } from "@/lib/data/entities"
import { DataManagementList } from "@/components/admin/data-management-list"
import {
  getFinanceExportConfigsAction,
  createFinanceExportConfigAction,
  updateFinanceExportConfigAction,
  deleteFinanceExportConfigAction,
  getImportJobsAction,
  createExportJobAction,
} from "./actions"

export default async function AdminDataManagementPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [entities, configs, jobs] = await Promise.all([
    getAllEntities(ctx),
    getAllFinanceExportConfigs(ctx),
    getImportJobs(ctx),
  ])

  return (
    <DataManagementList
      entities={entities}
      configs={configs}
      jobs={jobs}
      getConfigsAction={getFinanceExportConfigsAction}
      createConfigAction={createFinanceExportConfigAction}
      updateConfigAction={updateFinanceExportConfigAction}
      deleteConfigAction={deleteFinanceExportConfigAction}
      getJobsAction={getImportJobsAction}
      createExportJobAction={createExportJobAction}
    />
  )
}
