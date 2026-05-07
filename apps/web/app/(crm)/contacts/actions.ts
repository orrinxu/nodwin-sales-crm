"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import {
  createContact,
  updateContact,
  bulkCreateContacts,
  contactCreateSchema,
  contactUpdateSchema,
} from "@/lib/data/contacts"
import type { ContactCreateInput, BulkImportResult } from "@/lib/data/contacts"

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

export async function bulkImportContactsAction(
  rows: ContactCreateInput[],
): Promise<BulkImportResult> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const result = await bulkCreateContacts(ctx, rows)
  revalidatePath("/contacts")
  return result
}
