import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { businessUnitKinds } from "@/lib/shared/business-unit-kinds"
import type { BusinessUnitKind } from "@/lib/shared/business-unit-kinds"

export { businessUnitKinds, type BusinessUnitKind }

export interface BusinessUnitCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface BusinessUnitRecord {
  id: string
  name: string
  entityId: string | null
  kind: BusinessUnitKind
  parentId: string | null
  managerUserId: string | null
  active: boolean
  customData: Record<string, unknown>
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface BusinessUnitWithEntity extends BusinessUnitRecord {
  entityName: string | null
  parentName: string | null
  managerName: string | null
}

export const businessUnitCreateSchema = z.object({
  name: z.string().min(1, "Business unit name is required").max(200),
  entityId: z.string().uuid().nullable().optional(),
  kind: z.enum(businessUnitKinds).default("sales"),
  parentId: z.string().uuid().nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export const businessUnitUpdateSchema = z.object({
  name: z.string().min(1, "Business unit name is required").max(200).optional(),
  entityId: z.string().uuid().nullable().optional(),
  kind: z.enum(businessUnitKinds).optional(),
  parentId: z.string().uuid().nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
})

export type BusinessUnitCreateInput = z.input<typeof businessUnitCreateSchema>
export type BusinessUnitUpdateInput = z.input<typeof businessUnitUpdateSchema>

function toDomainBusinessUnit(data: Record<string, unknown>): BusinessUnitRecord {
  return {
    id: data.id as string,
    name: data.name as string,
    entityId: (data.entity_id as string) ?? null,
    kind: (data.kind as BusinessUnitKind) ?? "sales",
    parentId: (data.parent_id as string) ?? null,
    managerUserId: (data.manager_user_id as string) ?? null,
    active: (data.active as boolean) ?? true,
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
  }
}

function toDomainBusinessUnitWithEntity(data: Record<string, unknown>): BusinessUnitWithEntity {
  const entity = data.entity as { name: string } | null
  const parent = data.parent as { name: string } | null
  const manager = data.manager as { full_name: string } | null
  return {
    ...toDomainBusinessUnit(data),
    entityName: entity?.name ?? null,
    parentName: parent?.name ?? null,
    managerName: manager?.full_name ?? null,
  }
}

export async function getAllBusinessUnits(
  ctx: BusinessUnitCallContext,
): Promise<BusinessUnitWithEntity[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("business_units")
    .select(`
      *,
      entity:entity_id ( name ),
      parent:parent_id ( name ),
      manager:manager_user_id ( full_name )
    `)
    .order("name", { ascending: true })

  if (error) {
    throw new Error(`Failed to load business units: ${error.message}`)
  }

  return (data ?? []).map((r) =>
    toDomainBusinessUnitWithEntity(r as Record<string, unknown>),
  )
}

export async function getBusinessUnitById(
  ctx: BusinessUnitCallContext,
  id: string,
): Promise<BusinessUnitWithEntity | null> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("business_units")
    .select(`
      *,
      entity:entity_id ( name ),
      parent:parent_id ( name ),
      manager:manager_user_id ( full_name )
    `)
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return null
    }
    throw new Error(`Failed to load business unit: ${error.message}`)
  }

  return toDomainBusinessUnitWithEntity(data as Record<string, unknown>)
}

function toDbBusinessUnit(
  input: BusinessUnitCreateInput | BusinessUnitUpdateInput,
): Record<string, unknown> {
  const db: Record<string, unknown> = {}

  if ("name" in input && input.name !== undefined) db.name = input.name
  if ("entityId" in input && input.entityId !== undefined) db.entity_id = input.entityId ?? null
  if ("kind" in input && input.kind !== undefined) db.kind = input.kind
  if ("parentId" in input && input.parentId !== undefined) db.parent_id = input.parentId ?? null
  if ("managerUserId" in input && input.managerUserId !== undefined) db.manager_user_id = input.managerUserId ?? null
  if ("customData" in input && input.customData !== undefined) db.custom_data = input.customData

  return db
}

export async function createBusinessUnit(
  ctx: BusinessUnitCallContext,
  input: BusinessUnitCreateInput,
): Promise<BusinessUnitRecord> {
  const parsed = businessUnitCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbBusinessUnit(parsed)

  const { data, error } = await supabase
    .from("business_units")
    .insert(dbData as never)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to create business unit: ${error.message}`)
  }

  return toDomainBusinessUnit(data as Record<string, unknown>)
}

export async function updateBusinessUnit(
  ctx: BusinessUnitCallContext,
  id: string,
  input: BusinessUnitUpdateInput,
): Promise<BusinessUnitRecord> {
  const parsed = businessUnitUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbBusinessUnit(parsed)

  if (Object.keys(dbData).length === 0) {
    const bu = await getBusinessUnitById(ctx, id)
    if (!bu) throw new Error("Business unit not found")
    return bu
  }

  const { error } = await supabase
    .from("business_units")
    .update(dbData as never)
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to update business unit: ${error.message}`)
  }

  const bu = await getBusinessUnitById(ctx, id)
  if (!bu) throw new Error("Business unit not found after update")
  return bu
}

export async function deactivateBusinessUnit(
  ctx: BusinessUnitCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("business_units")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to deactivate business unit: ${error.message}`)
  }
}
