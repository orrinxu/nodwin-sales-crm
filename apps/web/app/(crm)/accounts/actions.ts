"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import {
  createAccount,
  updateAccount,
  bulkDeleteAccounts,
  createAccountRelationship,
  upsertAccountRelationship,
  attachContactsToAccount,
  detachContactFromAccount,
  accountCreateSchema,
  accountUpdateSchema,
  bulkDeleteAccountsSchema,
  type AccountRelationshipKind,
} from "@/lib/data/accounts"
import { createActivity, activityCreateSchema } from "@/lib/data/activities"
import { setTaxIdsForAccount, setAccountTaxIdsSchema } from "@/lib/data/account-tax-ids"
import { createContact, contactCreateSchema } from "@/lib/data/contacts"
import { z } from "zod"

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

export async function saveAccountTaxIdsAction(accountId: string, input: unknown) {
  const user = await requireUser()
  const parsed = setAccountTaxIdsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await setTaxIdsForAccount(ctx, accountId, parsed)
  revalidatePath("/accounts")
  revalidatePath(`/accounts/${accountId}`)
}

const attachContactsSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(100),
})

export async function attachContactsToAccountAction(accountId: string, input: unknown) {
  const user = await requireUser()
  const { contactIds } = attachContactsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await attachContactsToAccount(ctx, accountId, contactIds)
  revalidatePath(`/accounts/${accountId}`)
}

export async function detachContactFromAccountAction(accountId: string, contactId: string) {
  const user = await requireUser()
  const parsedId = z.string().uuid().parse(contactId)
  const ctx = { user, source: "web" as const }
  await detachContactFromAccount(ctx, accountId, parsedId)
  revalidatePath(`/accounts/${accountId}`)
}

// Quick-create a contact already homed at this account (primary_account_id).
export async function createContactForAccountAction(accountId: string, input: unknown) {
  const user = await requireUser()
  const parsedAccountId = z.string().uuid().parse(accountId)
  const raw = (input ?? {}) as Record<string, unknown>
  const parsed = contactCreateSchema.parse({ ...raw, primaryAccountId: parsedAccountId })
  const ctx = { user, source: "web" as const }
  const contact = await createContact(ctx, parsed)
  revalidatePath(`/accounts/${parsedAccountId}`)
  return contact
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
