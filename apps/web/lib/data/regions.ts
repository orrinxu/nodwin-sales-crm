import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

// Regions (ORR-720): the management layer for the region/group visibility engine
// (ORR-714). A region groups entities; a regional_head sees deals across every
// entity in their region. Admin-managed lookup — RLS: read authenticated, write
// Super Admin (migration 20260713140000).

export interface RegionCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface RegionRecord {
  id: string
  name: string
  code: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export const regionCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  code: z
    .string()
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, "Code may contain only letters, numbers, hyphens and underscores")
    .nullable()
    .optional()
    .or(z.literal("")),
})

export const regionUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(120).optional(),
  code: z
    .string()
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, "Code may contain only letters, numbers, hyphens and underscores")
    .nullable()
    .optional()
    .or(z.literal("")),
  active: z.boolean().optional(),
})

export type RegionCreateInput = z.input<typeof regionCreateSchema>
export type RegionUpdateInput = z.input<typeof regionUpdateSchema>

function toDomainRegion(data: Record<string, unknown>): RegionRecord {
  return {
    id: data.id as string,
    name: data.name as string,
    code: (data.code as string) ?? null,
    active: (data.active as boolean) ?? true,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getAllRegions(ctx: RegionCallContext): Promise<RegionRecord[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("regions")
    .select("*")
    .order("name", { ascending: true })
  if (error) throw new Error(`Failed to load regions: ${error.message}`)
  return (data ?? []).map((r) => toDomainRegion(r as Record<string, unknown>))
}

export async function createRegion(
  ctx: RegionCallContext,
  input: RegionCreateInput,
): Promise<RegionRecord> {
  const parsed = regionCreateSchema.parse(input)
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("regions")
    .insert({ name: parsed.name, code: parsed.code || null, created_by: ctx.user.id } as never)
    .select("*")
    .single()
  if (error) throw new Error(`Failed to create region: ${error.message}`)
  return toDomainRegion(data as Record<string, unknown>)
}

export async function updateRegion(
  ctx: RegionCallContext,
  id: string,
  input: RegionUpdateInput,
): Promise<RegionRecord> {
  const parsed = regionUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = { updated_by: ctx.user.id }
  if (parsed.name !== undefined) dbData.name = parsed.name
  if (parsed.code !== undefined) dbData.code = parsed.code || null
  if (parsed.active !== undefined) dbData.active = parsed.active

  const { data, error } = await supabase
    .from("regions")
    .update(dbData as never)
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw new Error(`Failed to update region: ${error.message}`)
  return toDomainRegion(data as Record<string, unknown>)
}

export async function deactivateRegion(ctx: RegionCallContext, id: string): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("regions")
    .update({ active: false } as never)
    .eq("id", id)
  if (error) throw new Error(`Failed to deactivate region: ${error.message}`)
}
