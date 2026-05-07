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
