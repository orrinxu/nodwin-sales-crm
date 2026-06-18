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
