"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllRelationshipTypes,
  createRelationshipType,
  relationshipTypeCreateSchema,
  updateRelationshipType,
  relationshipTypeUpdateSchema,
  deactivateRelationshipType,
} from "@/lib/data/relationship-types"

export async function getAllRelationshipTypesAction() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  return getAllRelationshipTypes(ctx)
}

export async function createRelationshipTypeAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = relationshipTypeCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const rt = await createRelationshipType(ctx, parsed)
  revalidatePath("/admin/relationship-types")
  return rt
}

export async function updateRelationshipTypeAction(code: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = relationshipTypeUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const rt = await updateRelationshipType(ctx, code, parsed)
  revalidatePath("/admin/relationship-types")
  return rt
}

export async function deactivateRelationshipTypeAction(code: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deactivateRelationshipType(ctx, code)
  revalidatePath("/admin/relationship-types")
}
