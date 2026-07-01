"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFxRates, createFxRate, fxRateCreateSchema } from "@/lib/data/fx-rates"

export async function getAllFxRatesAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  return getAllFxRates()
}

export async function createFxRateAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = fxRateCreateSchema.parse(input)
  const rate = await createFxRate(parsed)
  revalidatePath("/admin/financial/fx-rates")
  return rate
}
