"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllFiscalYearSettings,
  upsertFiscalYearSetting,
  fiscalYearCreateSchema,
} from "@/lib/data/fiscal-year"

export async function getAllFiscalYearSettingsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  return getAllFiscalYearSettings()
}

export async function upsertFiscalYearSettingAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = fiscalYearCreateSchema.parse(input)
  const record = await upsertFiscalYearSetting(parsed)
  revalidatePath("/admin/financial/fiscal-year")
  return record
}
