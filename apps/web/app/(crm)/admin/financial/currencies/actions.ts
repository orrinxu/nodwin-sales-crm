"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllCurrencies, updateCurrency, currencyUpdateSchema } from "@/lib/data/currencies"

export async function getAllCurrenciesAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  return getAllCurrencies()
}

export async function updateCurrencyAction(code: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = currencyUpdateSchema.parse(input)
  const currency = await updateCurrency(code, parsed)
  revalidatePath("/admin/financial/currencies")
  return currency
}
