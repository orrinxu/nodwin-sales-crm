import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import {
  clampPage,
  clampPageSize,
  rangeFor,
  sanitizeSearchTerm,
} from "@/lib/list/pagination"

export interface ContactCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

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
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ContactListRecord extends ContactRecord {
  primaryAccountName: string | null
  ownerName: string | null
}

export interface ContactListResult {
  contacts: ContactListRecord[]
  totalCount: number
  /** 1-based page this result represents (server-driven pagination). */
  page: number
  pageSize: number
}

export interface ContactListSearchParams {
  query?: string
  accountId?: string
  ownerId?: string
  /** 1-based page. Defaults to 1. */
  page?: number
  /** Rows per page. Clamped to `[1, MAX_PAGE_SIZE]`; defaults to `DEFAULT_PAGE_SIZE`. */
  pageSize?: number
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
  accountLinkIds: z.array(z.string().uuid()).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
  // Set only by the Salesforce importer (ORR-699) to make re-imports idempotent.
  legacySalesforceId: z.string().max(64).nullable().optional(),
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

function toDomainContactListRecord(data: Record<string, unknown>): ContactListRecord {
  const account = data.primary_account as { name: string } | null
  const owner = data.owner as { full_name: string } | null
  return {
    ...toDomainContact(data),
    primaryAccountName: account?.name ?? null,
    ownerName: owner?.full_name ?? null,
  }
}

export async function getContacts(
  ctx: ContactCallContext,
  params?: ContactListSearchParams,
): Promise<ContactListResult> {
  const supabase = await createServerClient()
  const page = clampPage(params?.page)
  const pageSize = clampPageSize(params?.pageSize)

  let query = supabase
    .from("contacts")
    .select(
      `
      *,
      primary_account:primary_account_id ( name ),
      owner:owner_user_id ( full_name )
    `,
      { count: "exact" },
    )

  const search = sanitizeSearchTerm(params?.query)
  if (search) {
    const q = `%${search}%`
    query = query.or(
      `full_name.ilike.${q},email.ilike.${q},phone.ilike.${q},title.ilike.${q}`,
    )
  }

  if (params?.accountId) {
    query = query.eq("primary_account_id", params.accountId)
  }

  if (params?.ownerId) {
    query = query.eq("owner_user_id", params.ownerId)
  }

  const [from, to] = rangeFor(page, pageSize)
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(`Failed to load contacts: ${error.message}`)
  }

  const contacts = (data ?? []).map(toDomainContactListRecord)
  const totalCount = count ?? 0

  return { contacts, totalCount, page, pageSize }
}

export const bulkDeleteContactsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one contact must be selected"),
})

export type BulkDeleteContactsInput = z.infer<typeof bulkDeleteContactsSchema>

export async function bulkDeleteContacts(
  ctx: ContactCallContext,
  input: BulkDeleteContactsInput,
): Promise<void> {
  const parsed = bulkDeleteContactsSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("contacts")
    .delete()
    .in("id", parsed.ids)

  if (error) {
    throw new Error(`Failed to bulk delete contacts: ${error.message}`)
  }
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

/**
 * Bounded initial list of accounts for the picker/filter dropdowns (ORR-767).
 * Previously this scanned every account on each page load; the pickers are now
 * typeahead-backed (`searchAccountOptions`) and display names are sourced from
 * the record (`getAccountOptionsByIds`), so a bounded first page is enough —
 * anything beyond it is reachable via search.
 */
export const ACCOUNT_OPTIONS_LIMIT = 50

export async function getAccountOptions(
  ctx: ContactCallContext,
): Promise<AccountOption[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .order("name", { ascending: true })
    .limit(ACCOUNT_OPTIONS_LIMIT)

  if (error) {
    throw new Error(`Failed to load account options: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }))
}

/**
 * Resolve a specific set of account ids to their names. Used to source display
 * names (primary + linked accounts) on the contact detail/edit view without
 * loading the whole account list — `getAccountOptions` is bounded (ORR-767), so
 * a linked account outside that bound would otherwise show as a raw id.
 */
export async function getAccountOptionsByIds(
  ctx: ContactCallContext,
  ids: string[],
): Promise<AccountOption[]> {
  void ctx
  const unique = Array.from(new Set(ids.filter((id) => id)))
  if (unique.length === 0) return []
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .in("id", unique)

  if (error) {
    throw new Error(`Failed to load account names: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }))
}

export async function searchAccountOptions(
  ctx: ContactCallContext,
  query: string,
): Promise<AccountOption[]> {
  const supabase = await createServerClient()

  const term = sanitizeSearchTerm(query)
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .ilike("name", `%${term}%`)
    .order("name", { ascending: true })
    .limit(20)

  if (error) {
    throw new Error(`Failed to search accounts: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }))
}

export interface ContactSearchParams {
  query?: string
  accountId?: string
}

export interface ContactOption {
  id: string
  name: string
}

export async function searchContactOptions(
  ctx: ContactCallContext,
  params?: ContactSearchParams,
): Promise<ContactOption[]> {
  const supabase = await createServerClient()

  let builder = supabase
    .from("contacts")
    .select("id, full_name")
    .order("full_name", { ascending: true })
    .limit(20)

  const contactTerm = sanitizeSearchTerm(params?.query)
  if (contactTerm) {
    builder = builder.ilike("full_name", `%${contactTerm}%`)
  }

  if (params?.accountId) {
    builder = builder.eq("primary_account_id", params.accountId)
  }

  const { data, error } = await builder

  if (error) {
    throw new Error(`Failed to search contacts: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.full_name as string,
  }))
}

export interface UserOption {
  id: string
  name: string
}

export async function searchUserOptions(
  ctx: ContactCallContext,
  query: string,
): Promise<UserOption[]> {
  const supabase = await createServerClient()

  let builder = supabase
    .from("users")
    .select("id, full_name")
    .eq("active", true)
    .order("full_name", { ascending: true })
    .limit(20)

  const userTerm = sanitizeSearchTerm(query)
  if (userTerm) {
    builder = builder.ilike("full_name", `%${userTerm}%`)
  }

  const { data, error } = await builder

  if (error) {
    throw new Error(`Failed to search users: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.full_name as string,
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
  if (input.customData !== undefined) {
    dbData.custom_data = input.customData
  }
  if (input.legacySalesforceId !== undefined) {
    dbData.legacy_salesforce_id = input.legacySalesforceId || null
  }

  return dbData
}

export interface ContactPickerOption {
  id: string
  fullName: string
  email: string | null
  title: string | null
}

// Lightweight list of all RLS-visible contacts, for pickers (e.g. attaching
// contacts to an account). Unlike getContacts (paged at 20) this returns the
// full visible set up to a generous cap, ordered by name.
export async function getContactOptions(ctx: ContactCallContext): Promise<ContactPickerOption[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("contacts")
    .select("id, full_name, email, title")
    .order("full_name", { ascending: true })
    .limit(1000)
  if (error) {
    throw new Error(`Failed to load contact options: ${error.message}`)
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: row.id as string,
      fullName: row.full_name as string,
      email: (row.email as string) ?? null,
      title: (row.title as string) ?? null,
    }
  })
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
    .insert(dbData as never)
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
  if (parsed.customData !== undefined) dbData.custom_data = parsed.customData

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("contacts")
      .update(dbData as never)
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
