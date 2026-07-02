"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import {
  createAccount,
  updateAccount,
  bulkDeleteAccounts,
  createAccountRelationship,
  upsertAccountRelationship,
  accountCreateSchema,
  accountUpdateSchema,
  bulkDeleteAccountsSchema,
  type AccountRelationshipKind,
} from "@/lib/data/accounts"
import { createActivity, activityCreateSchema } from "@/lib/data/activities"

export async function createAccountActivityAction(accountId: string, input: unknown) {
  const user = await requireUser()
  const parsed = activityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const activity = await createActivity(ctx, parsed)
  revalidatePath(`/accounts/${accountId}`)
  return activity
}

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

export async function createAccountRelationshipAction(
  fromAccountId: string,
  toAccountId: string,
  kind: AccountRelationshipKind,
  notes?: string | null,
) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  await createAccountRelationship(ctx, { fromAccountId, toAccountId, kind, notes })
  revalidatePath(`/accounts/${fromAccountId}`)
}

export async function upsertAccountRelationshipAction(
  fromAccountId: string,
  toAccountId: string,
  kind: AccountRelationshipKind,
  notes?: string | null,
) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  await upsertAccountRelationship(ctx, { fromAccountId, toAccountId, kind, notes })
  revalidatePath(`/accounts/${fromAccountId}`)
}

export async function bulkDeleteAccountsAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkDeleteAccountsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkDeleteAccounts(ctx, parsed)
  revalidatePath("/accounts")
}
