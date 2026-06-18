import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import type { ContactRecord } from "@/lib/data/contacts"
import type { DealStage } from "@/lib/opportunity"

export interface AccountCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface AccountRecord {
  id: string
  name: string
  legalName: string | null
  website: string | null
  country: string | null
  industry: string | null
  description: string | null
  accountOwnerUserId: string | null
  emailDomains: string[] | null
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  deletedAt: string | null
}

export interface AccountDocument {
  id: string
  name: string
  mimeType: string
  category: string
  uploadedAt: string
  linkUrl: string | null
  driveFileId: string
}

export interface AccountListRecord extends AccountRecord {
  ownerName: string | null
  contactCount: number
  opportunityCount: number
}

export interface AccountListResult {
  accounts: AccountListRecord[]
  totalCount: number
}

export interface AccountListSearchParams {
  query?: string
  industry?: string
  ownerId?: string
}

export interface AccountRelationship {
  id: string
  fromAccountId: string
  toAccountId: string
  kind: "subsidiary_of" | "procurement_via" | "partner_with" | "parent_of" | "sister_company"
  notes: string | null
  toAccountName: string
}

export interface AccountOpportunity {
  id: string
  name: string
  stage: DealStage
  amount: string
  currency: string
  closeDate: string | null
  probabilityPct: number
}

export const accountCreateSchema = z.object({
  name: z.string().min(1, "Account name is required").max(200),
  legalName: z.string().max(200).nullable().optional().or(z.literal("")),
  website: z.string().url("Must be a valid URL").max(500).nullable().optional().or(z.literal("")),
  country: z.string().max(100).nullable().optional().or(z.literal("")),
  industry: z.string().max(100).nullable().optional().or(z.literal("")),
  description: z.string().max(5000).nullable().optional().or(z.literal("")),
  accountOwnerUserId: z.string().uuid().nullable().optional(),
  emailDomains: z.array(z.string().min(1)).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export const accountUpdateSchema = accountCreateSchema.partial()

export type AccountCreateInput = z.infer<typeof accountCreateSchema>
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>

function toDomainAccount(data: Record<string, unknown>): AccountRecord {
  return {
    id: data.id as string,
    name: data.name as string,
    legalName: (data.legal_name as string) ?? null,
    website: (data.website as string) ?? null,
    country: (data.country as string) ?? null,
    industry: (data.industry as string) ?? null,
    description: (data.description as string) ?? null,
    accountOwnerUserId: (data.account_owner_user_id as string) ?? null,
    emailDomains: (data.email_domains as string[]) ?? null,
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
    deletedAt: (data.deleted_at as string) ?? null,
  }
}

export async function getAccountById(
  ctx: AccountCallContext,
  id: string,
): Promise<AccountRecord | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw new Error(`Failed to load account: ${error.message}`)
  }

  return toDomainAccount(data as Record<string, unknown>)
}

export type AccountRelationshipKind =
  | "subsidiary_of"
  | "procurement_via"
  | "partner_with"
  | "parent_of"
  | "sister_company"

export interface RelationshipTreeNode {
  id: string
  accountId: string
  accountName: string
  kind: AccountRelationshipKind | null
  direction: "outbound" | "inbound" | null
  notes: string | null
  children: RelationshipTreeNode[]
}

export interface AccountRelationshipGraph {
  root: RelationshipTreeNode
}

export async function getAccountRelationshipGraph(
  ctx: AccountCallContext,
  accountId: string,
): Promise<AccountRelationshipGraph> {
  const supabase = await createServerClient()

  const { data: accountData, error: accountError } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("id", accountId)
    .is("deleted_at", null)
    .single()

  if (accountError) {
    throw new Error(`Failed to load account: ${accountError.message}`)
  }

  const accountName = (accountData as { name: string }).name

  const [{ data: outbound }, { data: inboundData }] = await Promise.all([
    supabase
      .from("account_relationships")
      .select(`*, to_account:to_account_id ( name )`)
      .eq("from_account_id", accountId),
    supabase
      .from("account_relationships")
      .select(`*, from_account:from_account_id ( name )`)
      .eq("to_account_id", accountId),
  ])

  const children: RelationshipTreeNode[] = []

  for (const r of (outbound ?? []) as Record<string, unknown>[]) {
    const toAcc = r.to_account as { name: string } | null
    children.push({
      id: r.id as string,
      accountId: r.to_account_id as string,
      accountName: toAcc?.name ?? "\u2014",
      kind: r.kind as AccountRelationshipKind,
      direction: "outbound",
      notes: (r.notes as string) ?? null,
      children: [],
    })
  }

  for (const r of (inboundData ?? []) as Record<string, unknown>[]) {
    const fromAcc = r.from_account as { name: string } | null
    children.push({
      id: r.id as string,
      accountId: r.from_account_id as string,
      accountName: fromAcc?.name ?? "\u2014",
      kind: r.kind as AccountRelationshipKind,
      direction: "inbound",
      notes: (r.notes as string) ?? null,
      children: [],
    })
  }

  return {
    root: {
      id: accountId,
      accountId,
      accountName,
      kind: null,
      direction: null,
      notes: null,
      children,
    },
  }
}

function toDomainAccountListRecord(data: Record<string, unknown>): AccountListRecord {
  const owner = data.owner as { full_name: string } | null
  return {
    ...toDomainAccount(data),
    ownerName: owner?.full_name ?? null,
    contactCount: (data.contact_count as number) ?? 0,
    opportunityCount: (data.opportunity_count as number) ?? 0,
  }
}

export async function getAccounts(
  ctx: AccountCallContext,
  params?: AccountListSearchParams,
): Promise<AccountListResult> {
  const supabase = await createServerClient()

  let query = supabase
    .from("accounts")
    .select(
      `
      *,
      owner:account_owner_user_id ( full_name ),
      contact_count:contacts!primary_account_id ( count ),
      opportunity_count:opportunities ( count )
      `,
      { count: "exact" },
    )
    .is("deleted_at", null)

  if (params?.query) {
    const q = `%${params.query}%`
    query = query.or(`name.ilike.${q},legal_name.ilike.${q},website.ilike.${q}`)
  }

  if (params?.industry) {
    query = query.eq("industry", params.industry)
  }

  if (params?.ownerId) {
    query = query.eq("account_owner_user_id", params.ownerId)
  }

  const { data, error, count } = await query.order("name", { ascending: true })

  if (error) {
    throw new Error(`Failed to load accounts: ${error.message}`)
  }

  const accounts = (data ?? []).map(toDomainAccountListRecord)
  const totalCount = count ?? 0

  return { accounts, totalCount }
}

export async function getAccountRelationships(
  ctx: AccountCallContext,
  accountId: string,
): Promise<AccountRelationship[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("account_relationships")
    .select(`
      *,
      to_account:to_account_id ( name )
    `)
    .eq("from_account_id", accountId)

  if (error) {
    throw new Error(`Failed to load account relationships: ${error.message}`)
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    fromAccountId: r.from_account_id as string,
    toAccountId: r.to_account_id as string,
    kind: r.kind as AccountRelationship["kind"],
    notes: (r.notes as string) ?? null,
    toAccountName: ((r.to_account as { name: string }) ?? { name: "\u2014" }).name,
  }))
}

export async function getContactsForAccount(
  ctx: AccountCallContext,
  accountId: string,
): Promise<Pick<ContactRecord, "id" | "fullName" | "title" | "email">[]> {
  const supabase = await createServerClient()

  const { data: primary, error: primaryError } = await supabase
    .from("contacts")
    .select("id, full_name, title, email")
    .eq("primary_account_id", accountId)

  if (primaryError) {
    throw new Error(`Failed to load contacts: ${primaryError.message}`)
  }

  const { data: fromLinks, error: linkError } = await supabase
    .from("contact_account_links")
    .select("contact_id, contacts ( id, full_name, title, email )")
    .eq("account_id", accountId)

  if (linkError) {
    throw new Error(`Failed to load linked contacts: ${linkError.message}`)
  }

  const seen = new Set<string>()
  const result: { id: string; fullName: string; title: string | null; email: string | null }[] = []

  for (const c of (primary ?? []) as Record<string, unknown>[]) {
    result.push({
      id: c.id as string,
      fullName: c.full_name as string,
      title: (c.title as string) ?? null,
      email: (c.email as string) ?? null,
    })
    seen.add(c.id as string)
  }

  for (const r of (fromLinks ?? []) as Record<string, unknown>[]) {
    const contact = r.contacts as Record<string, unknown> | null
    if (contact && !seen.has(contact.id as string)) {
      result.push({
        id: contact.id as string,
        fullName: contact.full_name as string,
        title: (contact.title as string) ?? null,
        email: (contact.email as string) ?? null,
      })
      seen.add(contact.id as string)
    }
  }

  return result
}

export async function getOpportunitiesForAccount(
  ctx: AccountCallContext,
  accountId: string,
): Promise<AccountOpportunity[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load opportunities: ${error.message}`)
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    stage: r.stage as DealStage,
    amount: String(r.amount ?? "0"),
    currency: (r.currency as string) ?? "USD",
    closeDate: (r.close_date as string) ?? null,
    probabilityPct: Number(r.probability_pct ?? 0),
  }))
}

function toDbAccount(input: AccountCreateInput): Record<string, unknown> {
  const dbData: Record<string, unknown> = {
    name: input.name,
  }

  if (input.legalName !== undefined) {
    dbData.legal_name = input.legalName || null
  }
  if (input.website !== undefined) {
    dbData.website = input.website || null
  }
  if (input.country !== undefined) {
    dbData.country = input.country || null
  }
  if (input.industry !== undefined) {
    dbData.industry = input.industry || null
  }
  if (input.description !== undefined) {
    dbData.description = input.description || null
  }
  if (input.accountOwnerUserId !== undefined) {
    dbData.account_owner_user_id = input.accountOwnerUserId ?? null
  }
  if (input.emailDomains !== undefined) {
    dbData.email_domains = input.emailDomains.length > 0 ? input.emailDomains : null
  }
  if (input.customData !== undefined) {
    dbData.custom_data = input.customData
  }

  return dbData
}

export async function createAccount(
  ctx: AccountCallContext,
  input: AccountCreateInput,
): Promise<AccountRecord> {
  const parsed = accountCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbAccount(parsed)

  const { data, error } = await supabase
    .from("accounts")
    .insert(dbData)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to create account: ${error.message}`)
  }

  return toDomainAccount(data as Record<string, unknown>)
}

export async function updateAccount(
  ctx: AccountCallContext,
  id: string,
  input: AccountUpdateInput,
): Promise<AccountRecord> {
  const parsed = accountUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}

  if (parsed.name !== undefined) dbData.name = parsed.name
  if (parsed.legalName !== undefined) dbData.legal_name = parsed.legalName || null
  if (parsed.website !== undefined) dbData.website = parsed.website || null
  if (parsed.country !== undefined) dbData.country = parsed.country || null
  if (parsed.industry !== undefined) dbData.industry = parsed.industry || null
  if (parsed.description !== undefined) dbData.description = parsed.description || null
  if (parsed.accountOwnerUserId !== undefined) dbData.account_owner_user_id = parsed.accountOwnerUserId ?? null
  if (parsed.emailDomains !== undefined) dbData.email_domains = parsed.emailDomains.length > 0 ? parsed.emailDomains : null
  if (parsed.customData !== undefined) dbData.custom_data = parsed.customData

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("accounts")
      .update(dbData)
      .eq("id", id)

    if (error) {
      throw new Error(`Failed to update account: ${error.message}`)
    }
  }

  const account = await getAccountById(ctx, id)
  if (!account) throw new Error("Account not found after update")
  return account
}

export const bulkDeleteAccountsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one account must be selected"),
})

export type BulkDeleteAccountsInput = z.infer<typeof bulkDeleteAccountsSchema>

export async function bulkDeleteAccounts(
  ctx: AccountCallContext,
  input: BulkDeleteAccountsInput,
): Promise<void> {
  void ctx
  const parsed = bulkDeleteAccountsSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("accounts")
    .delete()
    .in("id", parsed.ids)

  if (error) {
    throw new Error(`Failed to bulk delete accounts: ${error.message}`)
  }
}

export async function softDeleteAccount(
  ctx: AccountCallContext,
  id: string,
): Promise<AccountRecord> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to soft-delete account: ${error.message}`)
  }

  return toDomainAccount(data as Record<string, unknown>)
}

export async function getIndustryOptions(
  ctx: AccountCallContext,
): Promise<string[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .select("industry")
    .is("deleted_at", null)
    .not("industry", "is", null)
    .order("industry")

  if (error) {
    throw new Error(`Failed to load industries: ${error.message}`)
  }

  const industries = new Set<string>()
  for (const row of (data ?? [])) {
    const val = (row as Record<string, unknown>).industry as string
    if (val) industries.add(val)
  }
  return Array.from(industries)
}

export async function getOwnerOptions(
  ctx: AccountCallContext,
): Promise<{ id: string; name: string }[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email")
    .order("full_name")

  if (error) {
    throw new Error(`Failed to load users: ${error.message}`)
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: (r.full_name as string) || (r.email as string) || "\u2014",
  }))
}

export async function getAccountLinkedOpportunities(
  ctx: AccountCallContext,
  accountId: string,
): Promise<AccountOpportunity[]> {
  return getOpportunitiesForAccount(ctx, accountId)
}

export async function getAccountLinkedContacts(
  ctx: AccountCallContext,
  accountId: string,
): Promise<Pick<ContactRecord, "id" | "fullName" | "title" | "email">[]> {
  return getContactsForAccount(ctx, accountId)
}

export async function getAccountLinkedDocuments(
  ctx: AccountCallContext,
  accountId: string,
): Promise<AccountDocument[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("documents")
    .select("id, name, mime_type, category, uploaded_at, link_url, drive_file_id")
    .eq("account_id", accountId)
    .order("uploaded_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load linked documents: ${error.message}`)
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    mimeType: r.mime_type as string,
    category: r.category as string,
    uploadedAt: r.uploaded_at as string,
    linkUrl: (r.link_url as string) ?? null,
    driveFileId: r.drive_file_id as string,
  }))
}

export async function getAccountOwnerOptions(
  ctx: AccountCallContext,
): Promise<{ id: string; name: string }[]> {
  return getOwnerOptions(ctx)
}

export async function createAccountRelationship(
  ctx: AccountCallContext,
  input: { fromAccountId: string; toAccountId: string; kind: AccountRelationshipKind; notes?: string | null },
): Promise<void> {
  void ctx.user
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("account_relationships")
    .insert({
      from_account_id: input.fromAccountId,
      to_account_id: input.toAccountId,
      kind: input.kind,
      notes: input.notes ?? null,
    })

  if (error) {
    throw new Error(`Failed to create account relationship: ${error.message}`)
  }
}

export async function upsertAccountRelationship(
  ctx: AccountCallContext,
  input: { fromAccountId: string; toAccountId: string; kind: AccountRelationshipKind; notes?: string | null },
): Promise<void> {
  void ctx.user
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("account_relationships")
    .upsert({
      from_account_id: input.fromAccountId,
      to_account_id: input.toAccountId,
      kind: input.kind,
      notes: input.notes ?? null,
    }, { onConflict: "from_account_id, to_account_id, kind" })

  if (error) {
    throw new Error(`Failed to upsert account relationship: ${error.message}`)
  }
}
