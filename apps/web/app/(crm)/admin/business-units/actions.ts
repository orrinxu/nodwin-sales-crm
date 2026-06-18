"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllBusinessUnits,
  getBusinessUnitById,
  createBusinessUnit,
  businessUnitCreateSchema,
  updateBusinessUnit,
  businessUnitUpdateSchema,
  deactivateBusinessUnit,
} from "@/lib/data/business-units"

export async function getAllBusinessUnitsAction() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  return getAllBusinessUnits(ctx)
}

export async function getBusinessUnitByIdAction(id: string) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  return getBusinessUnitById(ctx, id)
}

export async function createBusinessUnitAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = businessUnitCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const bu = await createBusinessUnit(ctx, parsed)
  revalidatePath("/admin/business-units")
  return bu
}

export async function updateBusinessUnitAction(id: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = businessUnitUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const bu = await updateBusinessUnit(ctx, id, parsed)
  revalidatePath("/admin/business-units")
  return bu
}

export async function deactivateBusinessUnitAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deactivateBusinessUnit(ctx, id)
  revalidatePath("/admin/business-units")
}
