import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface RelationshipTypeCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface RelationshipTypeRecord {
  code: string
  label: string
  description: string | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export const relationshipTypeCreateSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Code must start with a letter and contain only lowercase letters, numbers, and underscores"),
  label: z.string().min(1, "Label is required").max(200),
  description: z.string().max(1000).nullable().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).default(0),
})

export const relationshipTypeUpdateSchema = z.object({
  label: z.string().min(1, "Label is required").max(200).optional(),
  description: z.string().max(1000).nullable().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).optional(),
})

export type RelationshipTypeCreateInput = z.input<typeof relationshipTypeCreateSchema>
export type RelationshipTypeUpdateInput = z.input<typeof relationshipTypeUpdateSchema>

function toDomainRelationshipType(data: Record<string, unknown>): RelationshipTypeRecord {
  return {
    code: data.code as string,
    label: data.label as string,
    description: (data.description as string) ?? null,
    active: (data.active as boolean) ?? true,
    sortOrder: (data.sort_order as number) ?? 0,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getAllRelationshipTypes(
  ctx: RelationshipTypeCallContext,
): Promise<RelationshipTypeRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("relationship_types")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load relationship types: ${error.message}`)
  }

  return (data ?? []).map((r) =>
    toDomainRelationshipType(r as Record<string, unknown>),
  )
}

export async function createRelationshipType(
  ctx: RelationshipTypeCallContext,
  input: RelationshipTypeCreateInput,
): Promise<RelationshipTypeRecord> {
  const parsed = relationshipTypeCreateSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("relationship_types")
    .insert({
      code: parsed.code,
      label: parsed.label,
      description: parsed.description ?? null,
      sort_order: parsed.sortOrder,
    })
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to create relationship type: ${error.message}`)
  }

  return toDomainRelationshipType(data as Record<string, unknown>)
}

export async function updateRelationshipType(
  ctx: RelationshipTypeCallContext,
  code: string,
  input: RelationshipTypeUpdateInput,
): Promise<RelationshipTypeRecord> {
  const parsed = relationshipTypeUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}

  if (parsed.label !== undefined) dbData.label = parsed.label
  if (parsed.description !== undefined) dbData.description = parsed.description || null
  if (parsed.sortOrder !== undefined) dbData.sort_order = parsed.sortOrder

  if (Object.keys(dbData).length === 0) {
    throw new Error("No fields to update")
  }

  const { error } = await supabase
    .from("relationship_types")
    .update(dbData)
    .eq("code", code)

  if (error) {
    throw new Error(`Failed to update relationship type: ${error.message}`)
  }

  const { data, error: fetchError } = await supabase
    .from("relationship_types")
    .select("*")
    .eq("code", code)
    .single()

  if (fetchError || !data) {
    throw new Error("Relationship type not found after update")
  }

  return toDomainRelationshipType(data as Record<string, unknown>)
}

export async function deactivateRelationshipType(
  ctx: RelationshipTypeCallContext,
  code: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("relationship_types")
    .update({ active: false })
    .eq("code", code)

  if (error) {
    throw new Error(`Failed to deactivate relationship type: ${error.message}`)
  }
}
