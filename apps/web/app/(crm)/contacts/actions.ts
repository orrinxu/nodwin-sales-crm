"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import {
  createContact,
  updateContact,
  bulkDeleteContacts,
  contactCreateSchema,
  contactUpdateSchema,
  bulkDeleteContactsSchema,
} from "@/lib/data/contacts"
import { createActivity, activityCreateSchema } from "@/lib/data/activities"
import { createAccount, accountCreateSchema } from "@/lib/data/accounts"

// Inline quick-create for the Primary Account picker in the contact form /
// generator (ORR-738). Reuses the existing createAccount data path (RLS +
// created_by trigger + audit); owner defaults to the current user. Returns the
// { id, name } shape the EntityCombobox onCreate expects. Lets a rep create the
// extracted-but-new account inline instead of leaving the contact account-less.
export async function createAccountQuickAction(input: { name: string }) {
  const user = await requireUser()
  const parsed = accountCreateSchema.parse({
    name: input.name,
    accountOwnerUserId: user.id,
  })
  const ctx = { user, source: "web" as const }
  const account = await createAccount(ctx, parsed)
  revalidatePath("/contacts")
  return { id: account.id, name: account.name }
}

export async function createContactAction(input: unknown) {
  const user = await requireUser()
  const parsed = contactCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const contact = await createContact(ctx, parsed)
  revalidatePath("/contacts")
  return contact
}

export async function updateContactAction(id: string, input: unknown) {
  const user = await requireUser()
  const parsed = contactUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const contact = await updateContact(ctx, id, parsed)
  revalidatePath("/contacts")
  revalidatePath(`/contacts/${id}`)
  return contact
}

export async function createContactActivityAction(contactId: string, input: unknown) {
  const user = await requireUser()
  const parsed = activityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const activity = await createActivity(ctx, parsed)
  revalidatePath(`/contacts/${contactId}`)
  return activity
}

export async function bulkDeleteContactsAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkDeleteContactsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkDeleteContacts(ctx, parsed)
  revalidatePath("/contacts")
}
