import { z } from "zod"
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

/** True when a custom-field value counts as "not provided" for required checks. */
export function isCustomFieldValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Active, required definitions whose value is missing/empty in `customData`.
 * Shared by the form (client-side, to show inline errors) and the server actions
 * (to actually enforce `required`, which nothing did before — the asterisk was
 * purely cosmetic).
 */
export function findMissingRequiredFields(
  definitions: FieldDefinition[],
  customData: Record<string, unknown> | null | undefined,
): FieldDefinition[] {
  const data = customData ?? {}
  return definitions.filter((def) => {
    if (!def.required || !def.active) return false
    return isCustomFieldValueEmpty(data[def.key])
  })
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

export const createFieldDefinitionSchema = z.object({
  entityType: z.enum(fieldEntityTypes),
  label: z.string().min(1, "Label is required").max(200),
  dataType: z.enum(fieldDataTypes),
  options: z.array(z.string()).nullable(),
  required: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
})

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>

export const updateFieldDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Label is required"),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  displayOrder: z.number().int().min(0),
  visibleToRoles: z.array(z.string()).nullable(),
  editableByRoles: z.array(z.string()).nullable(),
})

export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionSchema>

export const bulkDeleteFieldDefinitionsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one field definition must be selected"),
})

export type BulkDeleteFieldDefinitionsInput = z.infer<typeof bulkDeleteFieldDefinitionsSchema>

export const reorderFieldDefinitionsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      displayOrder: z.number().int().min(0),
    }),
  ),
})

export type ReorderFieldDefinitionsInput = z.infer<typeof reorderFieldDefinitionsSchema>
