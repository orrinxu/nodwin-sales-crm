import "server-only"
import { createServerClient } from "@/lib/supabase/server"

export {
  fieldDataTypes,
  fieldEntityTypes,
  fieldDefinitionSchema,
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
  bulkDeleteFieldDefinitionsSchema,
  reorderFieldDefinitionsSchema,
} from "./field-definitions.types"

export type {
  FieldDataType,
  FieldEntityType,
  FieldDefinition,
  FieldCallContext,
  CreateFieldDefinitionInput,
  UpdateFieldDefinitionInput,
  BulkDeleteFieldDefinitionsInput,
  ReorderFieldDefinitionsInput,
} from "./field-definitions.types"

import {
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
  bulkDeleteFieldDefinitionsSchema,
  reorderFieldDefinitionsSchema,
} from "./field-definitions.types"

import type {
  FieldDefinition,
  FieldEntityType,
  FieldDataType,
  FieldCallContext,
  CreateFieldDefinitionInput,
  UpdateFieldDefinitionInput,
  BulkDeleteFieldDefinitionsInput,
  ReorderFieldDefinitionsInput,
} from "./field-definitions.types"

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

export async function createFieldDefinition(
  ctx: FieldCallContext,
  input: CreateFieldDefinitionInput,
): Promise<FieldDefinition> {
  void ctx
  const parsed = createFieldDefinitionSchema.parse(input)
  const supabase = await createServerClient()

  const baseKey = parsed.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")

  let key = baseKey
  let counter = 2

  while (true) {
    const { data: existing } = await supabase
      .from("field_definitions")
      .select("key")
      .eq("key", key)
      .single()

    if (!existing) break

    key = `${baseKey}_${counter}`
    counter++
  }

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

// ── Bulk soft-delete ─────────────────────────────────────────────────────────────

export async function bulkDeleteFieldDefinitions(
  ctx: FieldCallContext,
  input: BulkDeleteFieldDefinitionsInput,
): Promise<void> {
  const parsed = bulkDeleteFieldDefinitionsSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("field_definitions")
    .update({ active: false })
    .in("id", parsed.ids)

  if (error) {
    throw new Error(`Failed to bulk delete field definitions: ${error.message}`)
  }
}

// ── Individual soft-delete ──────────────────────────────────────────────────────

export async function softDeleteFieldDefinition(
  ctx: FieldCallContext,
  id: string,
): Promise<void> {
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("field_definitions")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to soft-delete field definition: ${error.message}`)
  }
}

// ── Reorder ──────────────────────────────────────────────────────────────────────

export async function reorderFieldDefinitions(
  ctx: FieldCallContext,
  input: ReorderFieldDefinitionsInput,
): Promise<void> {
  void ctx
  const parsed = reorderFieldDefinitionsSchema.parse(input)
  const supabase = await createServerClient()

  if (parsed.items.length === 0) return

  const { error } = await supabase
    .from("field_definitions")
    .upsert(
      parsed.items.map((item) => ({
        id: item.id,
        display_order: item.displayOrder,
      })),
    )

  if (error) {
    throw new Error(`Failed to reorder field definitions: ${error.message}`)
  }
}

// ── Update ───────────────────────────────────────────────────────────────────────

export async function updateFieldDefinition(
  ctx: FieldCallContext,
  input: UpdateFieldDefinitionInput,
): Promise<void> {
  const parsed = updateFieldDefinitionSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("field_definitions")
    .update({
      label: parsed.label,
      required: parsed.required,
      options: parsed.options,
      display_order: parsed.displayOrder,
      visible_to_roles: parsed.visibleToRoles,
      editable_by_roles: parsed.editableByRoles,
    })
    .eq("id", parsed.id)

  if (error) {
    throw new Error(`Failed to update field definition: ${error.message}`)
  }
}
