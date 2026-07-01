"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllReportingCurrencies,
  createReportingCurrency,
  deleteReportingCurrency,
  reportingCurrencyCreateSchema,
} from "@/lib/data/reporting-currency"

export async function getAllReportingCurrenciesAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  return getAllReportingCurrencies()
}

export async function createReportingCurrencyAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = reportingCurrencyCreateSchema.parse(input)
  const record = await createReportingCurrency(parsed)
  revalidatePath("/admin/financial/reporting-currency")
  return record
}

export async function deleteReportingCurrencyAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  await deleteReportingCurrency(id)
  revalidatePath("/admin/financial/reporting-currency")
}
