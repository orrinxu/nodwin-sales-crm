"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  createRegion,
  regionCreateSchema,
  updateRegion,
  regionUpdateSchema,
  deactivateRegion,
} from "@/lib/data/regions"

export async function createRegionAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = regionCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const region = await createRegion(ctx, parsed)
  revalidatePath("/admin/regions")
  revalidatePath("/admin/entities")
  return region
}

export async function updateRegionAction(id: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = regionUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const region = await updateRegion(ctx, id, parsed)
  revalidatePath("/admin/regions")
  revalidatePath("/admin/entities")
  return region
}

export async function deactivateRegionAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deactivateRegion(ctx, id)
  revalidatePath("/admin/regions")
  revalidatePath("/admin/entities")
}
