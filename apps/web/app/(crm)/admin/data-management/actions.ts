"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllFinanceExportConfigs,
  createFinanceExportConfig,
  financeExportConfigCreateSchema,
  updateFinanceExportConfig,
  financeExportConfigUpdateSchema,
  deleteFinanceExportConfig,
  getImportJobs,
  createImportJob,
  importJobCreateSchema,
} from "@/lib/data/data-management"
import {
  exportRecordsCsv,
  recordExportJob,
  EXPORT_ENTITIES,
  type ExportEntity,
} from "@/lib/data/csv-export"
import {
  importSalesforceCsv,
  type ImportResult,
} from "@/lib/data/import/salesforce-import"

// ORR-703 — real synchronous CSV export. Fetches the records (RLS-scoped,
// paginated), returns the CSV for the browser to download, and writes a completed
// import_jobs audit row so the export shows in the jobs list.
export async function exportRecordsAction(
  entityType: string,
): Promise<{ filename: string; csv: string; recordCount: number }> {
  const user = await requireUser()
  requireRole(user, "admin")
  if (!EXPORT_ENTITIES.includes(entityType as ExportEntity)) {
    throw new Error(`Unsupported export entity: ${entityType}`)
  }
  const ctx = { user, source: "web" as const }
  const result = await exportRecordsCsv(ctx, entityType as ExportEntity)
  try {
    await recordExportJob(ctx, entityType as ExportEntity, result.recordCount)
  } catch {
    // Audit row is best-effort — never block the download.
  }
  revalidatePath("/admin/data-management")
  return result
}

export async function getFinanceExportConfigsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getAllFinanceExportConfigs(ctx)
}

export async function createFinanceExportConfigAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = financeExportConfigCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const config = await createFinanceExportConfig(ctx, parsed)
  revalidatePath("/admin/data-management")
  return config
}

export async function updateFinanceExportConfigAction(
  id: string,
  input: unknown,
) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = financeExportConfigUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const config = await updateFinanceExportConfig(ctx, id, parsed)
  revalidatePath("/admin/data-management")
  return config
}

export async function deleteFinanceExportConfigAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deleteFinanceExportConfig(ctx, id)
  revalidatePath("/admin/data-management")
}

export async function getImportJobsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getImportJobs(ctx)
}

export async function createExportJobAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = importJobCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const job = await createImportJob(ctx, parsed)
  revalidatePath("/admin/data-management")
  return job
}

// ORR-699 — Salesforce CSV migration importer. Admin uploads an export file for
// one entity; each row is mapped, validated, and inserted (idempotent by
// Salesforce Id). Returns a per-row summary for the UI.
export async function importSalesforceAction(input: {
  entity: string
  csvText: string
  salesUnitId?: string
}): Promise<ImportResult> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const result = await importSalesforceCsv(ctx, {
    entity: input.entity as ImportResult["entity"],
    csvText: input.csvText,
    salesUnitId: input.salesUnitId,
  })
  revalidatePath("/admin/data-management")
  return result
}
