"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllAllowedDomains,
  createAllowedDomain,
  deleteAllowedDomain,
  allowedDomainCreateSchema,
} from "@/lib/data/allowed-domains"

export async function getAllowedDomainsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getAllAllowedDomains(ctx)
}

export async function createAllowedDomainAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = allowedDomainCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const domain = await createAllowedDomain(ctx, parsed)
  revalidatePath("/admin/allowed-domains")
  return domain
}

export async function deleteAllowedDomainAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deleteAllowedDomain(ctx, id)
  revalidatePath("/admin/allowed-domains")
}
