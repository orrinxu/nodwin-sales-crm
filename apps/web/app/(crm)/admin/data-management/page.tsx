import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFinanceExportConfigs } from "@/lib/data/data-management"
import { getImportJobs } from "@/lib/data/data-management"
import { getAllEntities } from "@/lib/data/entities"
import { getBusinessUnitOptions } from "@/lib/data/opportunities"
import { DataManagementList } from "@/components/admin/data-management-list"
import { SalesforceImportCard } from "@/components/admin/salesforce-import-card"
import {
  getFinanceExportConfigsAction,
  createFinanceExportConfigAction,
  updateFinanceExportConfigAction,
  deleteFinanceExportConfigAction,
  getImportJobsAction,
  exportRecordsAction,
  importSalesforceAction,
} from "./actions"

export default async function AdminDataManagementPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [entities, configs, jobs, businessUnits] = await Promise.all([
    getAllEntities(ctx),
    getAllFinanceExportConfigs(ctx),
    getImportJobs(ctx),
    getBusinessUnitOptions(ctx),
  ])

  return (
    <div className="space-y-6">
      <DataManagementList
        entities={entities}
        configs={configs}
        jobs={jobs}
        getConfigsAction={getFinanceExportConfigsAction}
        createConfigAction={createFinanceExportConfigAction}
        updateConfigAction={updateFinanceExportConfigAction}
        deleteConfigAction={deleteFinanceExportConfigAction}
        getJobsAction={getImportJobsAction}
        exportRecordsAction={exportRecordsAction}
      />
      <SalesforceImportCard
        businessUnits={businessUnits}
        importAction={importSalesforceAction}
      />
    </div>
  )
}
