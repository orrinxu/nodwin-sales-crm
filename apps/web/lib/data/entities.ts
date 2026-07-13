import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface EntityCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface EntityRecord {
  id: string
  name: string
  legalName: string | null
  country: string | null
  baseCurrency: string
  fiscalYearStartMonth: number
  active: boolean
  regionId: string | null
  displayName: string | null
  logoUrl: string | null
  emailFooter: string | null
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export const entityCreateSchema = z.object({
  name: z.string().min(1, "Entity name is required").max(200),
  legalName: z.string().max(300).nullable().optional().or(z.literal("")),
  country: z.string().max(100).nullable().optional().or(z.literal("")),
  baseCurrency: z.string().min(1, "Base currency is required").max(10).default("USD"),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  regionId: z.string().uuid().nullable().optional().or(z.literal("")),
  displayName: z.string().max(200).nullable().optional().or(z.literal("")),
  logoUrl: z.string().max(500).nullable().optional().or(z.literal("")),
  emailFooter: z.string().max(2000).nullable().optional().or(z.literal("")),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export const entityUpdateSchema = z.object({
  name: z.string().min(1, "Entity name is required").max(200).optional(),
  legalName: z.string().max(300).nullable().optional().or(z.literal("")),
  country: z.string().max(100).nullable().optional().or(z.literal("")),
  baseCurrency: z.string().min(1, "Base currency is required").max(10).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  regionId: z.string().uuid().nullable().optional().or(z.literal("")),
  displayName: z.string().max(200).nullable().optional().or(z.literal("")),
  logoUrl: z.string().max(500).nullable().optional().or(z.literal("")),
  emailFooter: z.string().max(2000).nullable().optional().or(z.literal("")),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export type EntityCreateInput = z.input<typeof entityCreateSchema>
export type EntityUpdateInput = z.input<typeof entityUpdateSchema>

function toDomainEntity(data: Record<string, unknown>): EntityRecord {
  return {
    id: data.id as string,
    name: data.name as string,
    legalName: (data.legal_name as string) ?? null,
    country: (data.country as string) ?? null,
    baseCurrency: (data.base_currency as string) ?? "USD",
    fiscalYearStartMonth: (data.fiscal_year_start_month as number) ?? 1,
    active: (data.active as boolean) ?? true,
    regionId: (data.region_id as string) ?? null,
    displayName: (data.display_name as string) ?? null,
    logoUrl: (data.logo_url as string) ?? null,
    emailFooter: (data.email_footer as string) ?? null,
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
  }
}

export async function getAllEntities(
  ctx: EntityCallContext,
): Promise<EntityRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`Failed to load entities: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainEntity(r as Record<string, unknown>))
}

export async function getEntityById(
  ctx: EntityCallContext,
  id: string,
): Promise<EntityRecord | null> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw new Error(`Failed to load entity: ${error.message}`)
  }

  return toDomainEntity(data as Record<string, unknown>)
}

function toDbEntity(input: EntityCreateInput | EntityUpdateInput): Record<string, unknown> {
  const db: Record<string, unknown> = {}

  if ("name" in input && input.name !== undefined) db.name = input.name
  if ("legalName" in input && input.legalName !== undefined) db.legal_name = input.legalName || null
  if ("country" in input && input.country !== undefined) db.country = input.country || null
  if ("baseCurrency" in input && input.baseCurrency !== undefined) db.base_currency = input.baseCurrency
  if ("fiscalYearStartMonth" in input && input.fiscalYearStartMonth !== undefined) db.fiscal_year_start_month = input.fiscalYearStartMonth
  if ("regionId" in input && input.regionId !== undefined) db.region_id = input.regionId || null
  if ("displayName" in input && input.displayName !== undefined) db.display_name = input.displayName || null
  if ("logoUrl" in input && input.logoUrl !== undefined) db.logo_url = input.logoUrl || null
  if ("emailFooter" in input && input.emailFooter !== undefined) db.email_footer = input.emailFooter || null
  if ("customData" in input && input.customData !== undefined) db.custom_data = input.customData

  return db
}

export async function createEntity(
  ctx: EntityCallContext,
  input: EntityCreateInput,
): Promise<EntityRecord> {
  const parsed = entityCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbEntity(parsed)

  const { data, error } = await supabase
    .from("entities")
    .insert(dbData as never)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to create entity: ${error.message}`)
  }

  return toDomainEntity(data as Record<string, unknown>)
}

export async function updateEntity(
  ctx: EntityCallContext,
  id: string,
  input: EntityUpdateInput,
): Promise<EntityRecord> {
  const parsed = entityUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbEntity(parsed)

  if (Object.keys(dbData).length === 0) {
    const entity = await getEntityById(ctx, id)
    if (!entity) throw new Error("Entity not found")
    return entity
  }

  const { error } = await supabase
    .from("entities")
    .update(dbData as never)
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to update entity: ${error.message}`)
  }

  const entity = await getEntityById(ctx, id)
  if (!entity) throw new Error("Entity not found after update")
  return entity
}

export async function deactivateEntity(
  ctx: EntityCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("entities")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to deactivate entity: ${error.message}`)
  }
}
