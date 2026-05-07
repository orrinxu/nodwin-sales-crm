"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  bulkDeleteFieldDefinitions,
  bulkDeleteFieldDefinitionsSchema,
  createFieldDefinition,
  createFieldDefinitionSchema,
  softDeleteFieldDefinition,
  updateFieldDefinition,
  updateFieldDefinitionSchema,
} from "@/lib/data/field-definitions"

export async function createFieldDefinitionAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = createFieldDefinitionSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createFieldDefinition(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}

export async function bulkDeleteFieldDefinitionsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = bulkDeleteFieldDefinitionsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkDeleteFieldDefinitions(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}

export async function softDeleteFieldDefinitionAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await softDeleteFieldDefinition(ctx, id)
  revalidatePath("/admin/field-definitions")
}

export async function updateFieldDefinitionAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = updateFieldDefinitionSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateFieldDefinition(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}
