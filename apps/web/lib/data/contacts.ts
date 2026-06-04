import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface ContactCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export const CONTACT_STATUSES = ["active", "inactive", "lead", "customer", "archived"] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

export interface ContactRecord {
  id: string
  fullName: string
  primaryAccountId: string | null
  title: string | null
  email: string | null
  phone: string | null
  socials: Record<string, string>
  notes: string | null
  ownerUserId: string | null
  status: ContactStatus
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AccountOption {
  id: string
  name: string
}

export interface ContactAccountLink {
  id: string
  contactId: string
  accountId: string
}

const socialsSchema = z.record(z.string(), z.string())

export const contactCreateSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(200),
  primaryAccountId: z.string().uuid().nullable().optional(),
  title: z.string().max(100).nullable().optional().or(z.literal("")),
  email: z.string().email("Must be a valid email").max(320).nullable().optional().or(z.literal("")),
  phone: z.string().max(50).nullable().optional().or(z.literal("")),
  socials: socialsSchema.optional(),
  notes: z.string().max(5000).nullable().optional().or(z.literal("")),
  ownerUserId: z.string().uuid().nullable().optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  accountLinkIds: z.array(z.string().uuid()).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export const contactUpdateSchema = contactCreateSchema.partial()

export type ContactCreateInput = z.infer<typeof contactCreateSchema>
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>

function toDomainContact(data: Record<string, unknown>): ContactRecord {
  return {
    id: data.id as string,
    fullName: data.full_name as string,
    primaryAccountId: (data.primary_account_id as string) ?? null,
    title: (data.title as string) ?? null,
    email: (data.email as string) ?? null,
    phone: (data.phone as string) ?? null,
    socials: (data.socials ?? {}) as Record<string, string>,
    notes: (data.notes as string) ?? null,
    ownerUserId: (data.owner_user_id as string) ?? null,
    status: (data.status as ContactStatus) ?? "active",
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getContactById(
  ctx: ContactCallContext,
  id: string,
): Promise<ContactRecord | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw new Error(`Failed to load contact: ${error.message}`)
  }

  return toDomainContact(data as Record<string, unknown>)
}

export async function getContactAccountLinks(
  ctx: ContactCallContext,
  contactId: string,
): Promise<ContactAccountLink[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("contact_account_links")
    .select("id, contact_id, account_id")
    .eq("contact_id", contactId)

  if (error) {
    throw new Error(`Failed to load contact links: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    contactId: r.contact_id as string,
    accountId: r.account_id as string,
  }))
}

export interface ContactListFilters {
  status?: ContactStatus | null
}

export async function getContactList(
  ctx: ContactCallContext,
  filters?: ContactListFilters,
): Promise<ContactRecord[]> {
  const supabase = await createServerClient()

  let query = supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to load contacts: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainContact(r as Record<string, unknown>))
}

export async function getAccountOptions(
  ctx: ContactCallContext,
): Promise<AccountOption[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`Failed to load account options: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }))
}

function toDbContact(input: ContactCreateInput): Record<string, unknown> {
  const dbData: Record<string, unknown> = {
    full_name: input.fullName,
  }

  if (input.primaryAccountId !== undefined) {
    dbData.primary_account_id = input.primaryAccountId ?? null
  }
  if (input.title !== undefined) {
    dbData.title = input.title || null
  }
  if (input.email !== undefined) {
    dbData.email = input.email || null
  }
  if (input.phone !== undefined) {
    dbData.phone = input.phone || null
  }
  if (input.notes !== undefined) {
    dbData.notes = input.notes || null
  }
  if (input.socials !== undefined) {
    dbData.socials = input.socials
  }
  if (input.ownerUserId !== undefined) {
    dbData.owner_user_id = input.ownerUserId ?? null
  }
  if (input.status !== undefined) {
    dbData.status = input.status
  }
  if (input.customData !== undefined) {
    dbData.custom_data = input.customData
  }

  return dbData
}

export async function createContact(
  ctx: ContactCallContext,
  input: ContactCreateInput,
): Promise<ContactRecord> {
  const parsed = contactCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbContact(parsed)

  const { data, error } = await supabase
    .from("contacts")
    .insert(dbData)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to create contact: ${error.message}`)
  }

  const contact = toDomainContact(data as Record<string, unknown>)

  if (parsed.accountLinkIds && parsed.accountLinkIds.length > 0) {
    const links = parsed.accountLinkIds.map((accountId) => ({
      contact_id: contact.id,
      account_id: accountId,
    }))

    const { error: linkError } = await supabase
      .from("contact_account_links")
      .insert(links)

    if (linkError) {
      throw new Error(`Failed to link accounts: ${linkError.message}`)
    }
  }

  return contact
}

export async function updateContact(
  ctx: ContactCallContext,
  id: string,
  input: ContactUpdateInput,
): Promise<ContactRecord> {
  const parsed = contactUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}

  if (parsed.fullName !== undefined) dbData.full_name = parsed.fullName
  if (parsed.primaryAccountId !== undefined) dbData.primary_account_id = parsed.primaryAccountId ?? null
  if (parsed.title !== undefined) dbData.title = parsed.title || null
  if (parsed.email !== undefined) dbData.email = parsed.email || null
  if (parsed.phone !== undefined) dbData.phone = parsed.phone || null
  if (parsed.socials !== undefined) dbData.socials = parsed.socials
  if (parsed.notes !== undefined) dbData.notes = parsed.notes || null
  if (parsed.ownerUserId !== undefined) dbData.owner_user_id = parsed.ownerUserId ?? null
  if (parsed.status !== undefined) dbData.status = parsed.status
  if (parsed.customData !== undefined) dbData.custom_data = parsed.customData

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("contacts")
      .update(dbData)
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to update contact: ${error.message}`)
    }
  }

  if (parsed.accountLinkIds !== undefined) {
    const { error: deleteError } = await supabase
      .from("contact_account_links")
      .delete()
      .eq("contact_id", id)

    if (deleteError) {
      throw new Error(`Failed to update account links: ${deleteError.message}`)
    }

    if (parsed.accountLinkIds.length > 0) {
      const links = parsed.accountLinkIds.map((accountId) => ({
        contact_id: id,
        account_id: accountId,
      }))

      const { error: insertError } = await supabase
        .from("contact_account_links")
        .insert(links)

      if (insertError) {
        throw new Error(`Failed to update account links: ${insertError.message}`)
      }
    }
  }

  const contact = await getContactById(ctx, id)
  if (!contact) throw new Error("Contact not found after update")
  return contact
}
