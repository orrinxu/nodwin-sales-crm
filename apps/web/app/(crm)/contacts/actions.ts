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

export async function bulkDeleteContactsAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkDeleteContactsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkDeleteContacts(ctx, parsed)
  revalidatePath("/contacts")
}
