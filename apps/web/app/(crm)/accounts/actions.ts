"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import {
  createAccount,
  updateAccount,
  bulkDeleteAccounts,
  accountCreateSchema,
  accountUpdateSchema,
  bulkDeleteAccountsSchema,
} from "@/lib/data/accounts"

export async function createAccountAction(input: unknown) {
  const user = await requireUser()
  const parsed = accountCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const account = await createAccount(ctx, parsed)
  revalidatePath("/accounts")
  return account
}

export async function updateAccountAction(id: string, input: unknown) {
  const user = await requireUser()
  const parsed = accountUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const account = await updateAccount(ctx, id, parsed)
  revalidatePath("/accounts")
  revalidatePath(`/accounts/${id}`)
  return account
}

export async function bulkDeleteAccountsAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkDeleteAccountsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkDeleteAccounts(ctx, parsed)
  revalidatePath("/accounts")
}
