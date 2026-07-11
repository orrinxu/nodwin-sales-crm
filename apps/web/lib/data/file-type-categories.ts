import "server-only"
import { createServerClient } from "@/lib/supabase/server"

export {
  createFileTypeCategorySchema,
  updateFileTypeCategorySchema,
  reorderFileTypeCategoriesSchema,
} from "./file-type-categories.types"

export type {
  FileTypeCategory,
  FileTypeCategoryCallContext,
  CreateFileTypeCategoryInput,
  UpdateFileTypeCategoryInput,
  ReorderFileTypeCategoriesInput,
} from "./file-type-categories.types"

import {
  createFileTypeCategorySchema,
  updateFileTypeCategorySchema,
  reorderFileTypeCategoriesSchema,
} from "./file-type-categories.types"

import type {
  FileTypeCategory,
  FileTypeCategoryCallContext,
  CreateFileTypeCategoryInput,
  UpdateFileTypeCategoryInput,
  ReorderFileTypeCategoriesInput,
} from "./file-type-categories.types"

function toDomain(data: Record<string, unknown>): FileTypeCategory {
  return {
    code: data.code as string,
    label: data.label as string,
    description: (data.description as string) ?? null,
    active: data.active as boolean,
    displayOrder: data.display_order as number,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
  }
}

export async function getFileTypeCategories(): Promise<FileTypeCategory[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("file_type_categories")
    .select("*")
    .eq("active", true)
    .order("display_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load file type categories: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomain(r as Record<string, unknown>))
}

export async function getAllFileTypeCategories(): Promise<FileTypeCategory[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("file_type_categories")
    .select("*")
    .order("display_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load all file type categories: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomain(r as Record<string, unknown>))
}

export async function createFileTypeCategory(
  ctx: FileTypeCategoryCallContext,
  input: CreateFileTypeCategoryInput,
): Promise<FileTypeCategory> {
  void ctx
  const parsed = createFileTypeCategorySchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("file_type_categories")
    .insert({
      code: parsed.code,
      label: parsed.label,
      description: parsed.description ?? null,
      display_order: parsed.displayOrder,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create file type category: ${error.message}`)
  }

  return toDomain(data as Record<string, unknown>)
}

export async function updateFileTypeCategory(
  ctx: FileTypeCategoryCallContext,
  input: UpdateFileTypeCategoryInput,
): Promise<void> {
  void ctx
  const parsed = updateFileTypeCategorySchema.parse(input)
  const supabase = await createServerClient()

  const updateData: Record<string, unknown> = {}
  if (parsed.label !== undefined) updateData.label = parsed.label
  if (parsed.description !== undefined)
    updateData.description = parsed.description ?? null
  if (parsed.active !== undefined) updateData.active = parsed.active
  if (parsed.displayOrder !== undefined)
    updateData.display_order = parsed.displayOrder

  if (Object.keys(updateData).length === 0) return

  const { error } = await supabase
    .from("file_type_categories")
    .update(updateData as never)
    .eq("code", parsed.code)

  if (error) {
    throw new Error(`Failed to update file type category: ${error.message}`)
  }
}

export async function softDeleteFileTypeCategory(
  ctx: FileTypeCategoryCallContext,
  code: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("file_type_categories")
    .update({ active: false })
    .eq("code", code)

  if (error) {
    throw new Error(
      `Failed to soft-delete file type category: ${error.message}`,
    )
  }
}

export async function reorderFileTypeCategories(
  ctx: FileTypeCategoryCallContext,
  input: ReorderFileTypeCategoriesInput,
): Promise<void> {
  void ctx
  const parsed = reorderFileTypeCategoriesSchema.parse(input)
  const supabase = await createServerClient()

  if (parsed.codes.length === 0) return

  const rows = parsed.codes.map((code, index) => ({
    code,
    display_order: index,
  }))

  const { error } = await supabase
    .from("file_type_categories")
    .upsert(rows as never)

  if (error) {
    throw new Error(
      `Failed to reorder file type categories: ${error.message}`,
    )
  }
}
