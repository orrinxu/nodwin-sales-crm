import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export const fieldDataTypes = [
  "text",
  "rich_text",
  "number",
  "currency",
  "date",
  "datetime",
  "single_select",
  "multi_select",
  "user_ref",
  "account_ref",
  "boolean",
  "url",
  "formula",
] as const

export type FieldDataType = (typeof fieldDataTypes)[number]

export const fieldEntityTypes = ["account", "contact", "opportunity", "activity"] as const

export type FieldEntityType = (typeof fieldEntityTypes)[number]

export interface FieldDefinition {
  id: string
  entityType: FieldEntityType
  key: string
  label: string
  dataType: FieldDataType
  options: string[] | null
  required: boolean
  defaultValue: unknown
  visibleToRoles: string[] | null
  editableByRoles: string[] | null
  visibleAtStages: string[] | null
  displayOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface FieldCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export const fieldDefinitionSchema = z.object({
  id: z.string(),
  entityType: z.enum(fieldEntityTypes),
  key: z.string(),
  label: z.string(),
  dataType: z.enum(fieldDataTypes),
  options: z.array(z.string()).nullable(),
  required: z.boolean(),
  defaultValue: z.unknown(),
  visibleToRoles: z.array(z.string()).nullable(),
  editableByRoles: z.array(z.string()).nullable(),
  visibleAtStages: z.array(z.string()).nullable(),
  displayOrder: z.number(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

function toDomainField(data: Record<string, unknown>): FieldDefinition {
  return {
    id: data.id as string,
    entityType: data.entity_type as FieldEntityType,
    key: data.key as string,
    label: data.label as string,
    dataType: data.data_type as FieldDataType,
    options: (data.options as string[]) ?? null,
    required: data.required as boolean,
    defaultValue: data.default_value,
    visibleToRoles: (data.visible_to_roles as string[]) ?? null,
    editableByRoles: (data.editable_by_roles as string[]) ?? null,
    visibleAtStages: (data.visible_at_stages as string[]) ?? null,
    displayOrder: data.display_order as number,
    active: data.active as boolean,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getFieldDefinitions(
  ctx: FieldCallContext,
  entityType: FieldEntityType,
): Promise<FieldDefinition[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("field_definitions")
    .select("*")
    .eq("entity_type", entityType)
    .eq("active", true)
    .order("display_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load field definitions: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainField(r as Record<string, unknown>))
}

// ── Admin: all definitions ──────────────────────────────────────────────────────

export async function getAllFieldDefinitions(
  ctx: FieldCallContext,
): Promise<FieldDefinition[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("field_definitions")
    .select("*")
    .order("display_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load field definitions: ${error.message}`)
  }

  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => toDomainField(r))
    .sort((a, b) => {
      const entityCmp = a.entityType.localeCompare(b.entityType)
      if (entityCmp !== 0) return entityCmp
      return a.displayOrder - b.displayOrder
    })
}

// ── Create ───────────────────────────────────────────────────────────────────────

export const createFieldDefinitionSchema = z.object({
  entityType: z.enum(fieldEntityTypes),
  label: z.string().min(1, "Label is required").max(200),
  dataType: z.enum(fieldDataTypes),
  options: z.array(z.string()).nullable(),
  required: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
})

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>

export async function createFieldDefinition(
  ctx: FieldCallContext,
  input: CreateFieldDefinitionInput,
): Promise<FieldDefinition> {
  void ctx
  const parsed = createFieldDefinitionSchema.parse(input)
  const supabase = await createServerClient()

  const key = parsed.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")

  const { data, error } = await supabase
    .from("field_definitions")
    .insert({
      entity_type: parsed.entityType,
      key,
      label: parsed.label,
      data_type: parsed.dataType,
      options: parsed.options,
      required: parsed.required,
      display_order: parsed.displayOrder,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create field definition: ${error.message}`)
  }

  return toDomainField(data as Record<string, unknown>)
}


