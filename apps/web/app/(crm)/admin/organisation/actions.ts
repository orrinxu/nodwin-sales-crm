"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole, requireAdminAccess } from "@/lib/security/auth"
import {
  setGroupReportingCurrency,
  setEntityReportingCurrency,
  removeEntityReportingCurrency,
  groupReportingCurrencySchema,
  entityReportingCurrencySchema,
} from "@/lib/data/organisation-settings"

// Changing the reporting currency changes what the dashboards/reports render in,
// so revalidate those alongside the admin page.
function revalidateReportingSurfaces() {
  revalidatePath("/admin/organisation")
  revalidatePath("/dashboard")
  revalidatePath("/reports")
}

export async function setGroupReportingCurrencyAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = groupReportingCurrencySchema.parse(input)
  const ctx = { user, source: "web" as const }
  await setGroupReportingCurrency(ctx, parsed)
  revalidateReportingSurfaces()
}

// Per-entity overrides: admin OR entity_admin. RLS confines an entity_admin to
// their own entity's row.
export async function setEntityReportingCurrencyAction(input: unknown) {
  const user = await requireUser()
  requireAdminAccess(user)
  const parsed = entityReportingCurrencySchema.parse(input)
  const ctx = { user, source: "web" as const }
  await setEntityReportingCurrency(ctx, parsed)
  revalidateReportingSurfaces()
}

export async function removeEntityReportingCurrencyAction(entityId: string) {
  const user = await requireUser()
  requireAdminAccess(user)
  const ctx = { user, source: "web" as const }
  await removeEntityReportingCurrency(ctx, entityId)
  revalidateReportingSurfaces()
}
