import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export const accountFiltersSchema = z.object({
  q: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type AccountFiltersInput = z.infer<typeof accountFiltersSchema>

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
  ownerName: string | null
  emailDomains: string[] | null
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AccountListResult {
  accounts: AccountRecord[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

function toDomainAccount(data: Record<string, unknown>): AccountRecord {
  const owner = data.owner as { full_name: string } | null
  return {
    id: data.id as string,
    name: data.name as string,
    legalName: (data.legal_name as string) ?? null,
    website: (data.website as string) ?? null,
    country: (data.country as string) ?? null,
    industry: (data.industry as string) ?? null,
    description: (data.description as string) ?? null,
    accountOwnerUserId: (data.account_owner_user_id as string) ?? null,
    ownerName: owner?.full_name ?? null,
    emailDomains: (data.email_domains as string[]) ?? null,
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getAccounts(
  ctx: AccountCallContext,
  input?: AccountFiltersInput,
): Promise<AccountListResult> {
  const filters = accountFiltersSchema.parse(input ?? {})
  const supabase = await createServerClient()

  let query = supabase
    .from("accounts")
    .select(
      `
      id,
      name,
      legal_name,
      website,
      country,
      industry,
      description,
      account_owner_user_id,
      email_domains,
      custom_data,
      created_at,
      updated_at,
      owner:account_owner_user_id ( full_name )
    `,
      { count: "exact" },
    )

  if (filters.q) {
    query = query.ilike("name", `%${filters.q}%`)
  }

  if (filters.industry) {
    query = query.eq("industry", filters.industry)
  }

  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(`Failed to load accounts: ${error.message}`)
  }

  const accounts = (data ?? []).map(toDomainAccount)
  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / filters.pageSize))

  return {
    accounts,
    totalCount,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages,
  }
}

export async function getAccountById(
  ctx: AccountCallContext,
  id: string,
): Promise<AccountRecord | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .select(
      `
      id,
      name,
      legal_name,
      website,
      country,
      industry,
      description,
      account_owner_user_id,
      email_domains,
      custom_data,
      created_at,
      updated_at,
      owner:account_owner_user_id ( full_name )
    `,
    )
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw new Error(`Failed to load account: ${error.message}`)
  }

  return toDomainAccount(data as Record<string, unknown>)
}

export const accountCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  legalName: z.string().max(200).nullable().optional(),
  website: z.string().url("Must be a valid URL").max(500).refine(
    (url) => !url || url.startsWith("http://") || url.startsWith("https://"),
    "URL must use http:// or https:// protocol",
  ).nullable().optional().or(z.literal("")),
  country: z.string().max(100).nullable().optional(),
  industry: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  accountOwnerUserId: z.string().uuid().nullable().optional(),
  emailDomains: z.string().max(500).nullable().optional(),
})

export const accountUpdateSchema = accountCreateSchema.partial()

export type AccountCreateInput = z.infer<typeof accountCreateSchema>
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>

function toDbAccount(
  input: AccountCreateInput,
): Record<string, unknown> {
  return {
    name: input.name,
    legal_name: input.legalName ?? null,
    website: input.website && input.website !== "" ? input.website : null,
    country: input.country ?? null,
    industry: input.industry ?? null,
    description: input.description ?? null,
    account_owner_user_id: input.accountOwnerUserId ?? null,
    email_domains: input.emailDomains
      ? input.emailDomains
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean)
      : null,
  }
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
    .select(
      `
      id,
      name,
      legal_name,
      website,
      country,
      industry,
      description,
      account_owner_user_id,
      email_domains,
      custom_data,
      created_at,
      updated_at,
      owner:account_owner_user_id ( full_name )
    `,
    )
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
  if (parsed.legalName !== undefined) dbData.legal_name = parsed.legalName ?? null
  if (parsed.website !== undefined) {
    dbData.website = parsed.website && parsed.website !== "" ? parsed.website : null
  }
  if (parsed.country !== undefined) dbData.country = parsed.country ?? null
  if (parsed.industry !== undefined) dbData.industry = parsed.industry ?? null
  if (parsed.description !== undefined) dbData.description = parsed.description ?? null
  if (parsed.accountOwnerUserId !== undefined) {
    dbData.account_owner_user_id = parsed.accountOwnerUserId ?? null
  }
  if (parsed.emailDomains !== undefined) {
    dbData.email_domains = parsed.emailDomains
      ? parsed.emailDomains
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean)
      : null
  }

  if (Object.keys(dbData).length === 0) {
    const existing = await getAccountById(ctx, id)
    if (!existing) throw new Error("Account not found")
    return existing
  }

  const { data, error } = await supabase
    .from("accounts")
    .update(dbData)
    .eq("id", id)
    .select(
      `
      id,
      name,
      legal_name,
      website,
      country,
      industry,
      description,
      account_owner_user_id,
      email_domains,
      custom_data,
      created_at,
      updated_at,
      owner:account_owner_user_id ( full_name )
    `,
    )
    .single()

  if (error) {
    throw new Error(`Failed to update account: ${error.message}`)
  }

  return toDomainAccount(data as Record<string, unknown>)
}

export type AccountRelationshipKind =
  | "subsidiary_of"
  | "procurement_via"
  | "partner_with"
  | "parent_of"
  | "sister_company"

export interface AccountRelationshipRecord {
  id: string
  fromAccountId: string
  toAccountId: string
  kind: AccountRelationshipKind
  notes: string | null
  createdAt: string
}

export interface AccountTreeEdge {
  relationship: AccountRelationshipRecord
  fromAccount: { id: string; name: string }
  toAccount: { id: string; name: string }
}

export interface AccountTreeData {
  focalAccount: AccountRecord
  edges: AccountTreeEdge[]
}

export async function getAccountTree(
  ctx: AccountCallContext,
  accountId: string,
): Promise<AccountTreeData> {
  const supabase = await createServerClient()

  const focalAccount = await getAccountById(ctx, accountId)
  if (!focalAccount) {
    throw new Error("Account not found")
  }

  const { data: rels, error } = await supabase
    .from("account_relationships")
    .select(
      `
      id,
      from_account_id,
      to_account_id,
      kind,
      notes,
      created_at,
      from_account:from_account_id ( id, name ),
      to_account:to_account_id ( id, name )
    `,
    )
    .or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)

  if (error) {
    throw new Error(`Failed to load account tree: ${error.message}`)
  }

  const edges: AccountTreeEdge[] = (rels ?? []).map((r) => {
    const fromRaw = r.from_account as unknown as { id: string; name: string } | null
    const toRaw = r.to_account as unknown as { id: string; name: string } | null
    return {
      relationship: {
        id: r.id as string,
        fromAccountId: r.from_account_id as string,
        toAccountId: r.to_account_id as string,
        kind: r.kind as AccountRelationshipKind,
        notes: (r.notes as string) ?? null,
        createdAt: r.created_at as string,
      },
      fromAccount: fromRaw ?? { id: r.from_account_id as string, name: "Unknown" },
      toAccount: toRaw ?? { id: r.to_account_id as string, name: "Unknown" },
    }
  })

  return { focalAccount, edges }
}

export async function getAccountIndustries(
  ctx: AccountCallContext,
): Promise<string[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("accounts")
    .select("industry")
    .not("industry", "is", null)
    .order("industry", { ascending: true })

  if (error) {
    throw new Error(`Failed to load industries: ${error.message}`)
  }

  const industries = [
    ...new Set(
      (data ?? []).map((r) => r.industry).filter(Boolean) as string[],
    ),
  ]

  return industries.sort()
}
