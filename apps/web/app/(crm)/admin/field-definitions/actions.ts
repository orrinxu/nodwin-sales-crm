"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  bulkDeleteFieldDefinitions,
  bulkDeleteFieldDefinitionsSchema,
  createFieldDefinition,
  createFieldDefinitionSchema,
  reorderFieldDefinitions,
  reorderFieldDefinitionsSchema,
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

export async function reorderFieldDefinitionsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = reorderFieldDefinitionsSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await reorderFieldDefinitions(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}

// ── File type categories ──────────────────────────────────────────────────────

import {
  createFileTypeCategory,
  createFileTypeCategorySchema,
  updateFileTypeCategory,
  updateFileTypeCategorySchema,
  softDeleteFileTypeCategory,
  reorderFileTypeCategories,
  reorderFileTypeCategoriesSchema,
} from "@/lib/data/file-type-categories"

export async function createFileTypeCategoryAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = createFileTypeCategorySchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createFileTypeCategory(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}

export async function updateFileTypeCategoryAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = updateFileTypeCategorySchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateFileTypeCategory(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}

export async function deleteFileTypeCategoryAction(code: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await softDeleteFileTypeCategory(ctx, code)
  revalidatePath("/admin/field-definitions")
}

export async function reorderFileTypeCategoriesAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = reorderFileTypeCategoriesSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await reorderFileTypeCategories(ctx, parsed)
  revalidatePath("/admin/field-definitions")
}
