"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllEntities,
  getEntityById,
  createEntity,
  entityCreateSchema,
  updateEntity,
  entityUpdateSchema,
  deactivateEntity,
} from "@/lib/data/entities"

export async function getAllEntitiesAction() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  return getAllEntities(ctx)
}

export async function getEntityByIdAction(id: string) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  return getEntityById(ctx, id)
}

export async function createEntityAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = entityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const entity = await createEntity(ctx, parsed)
  revalidatePath("/admin/entities")
  return entity
}

export async function updateEntityAction(id: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = entityUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const entity = await updateEntity(ctx, id, parsed)
  revalidatePath("/admin/entities")
  return entity
}

export async function deactivateEntityAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deactivateEntity(ctx, id)
  revalidatePath("/admin/entities")
}
