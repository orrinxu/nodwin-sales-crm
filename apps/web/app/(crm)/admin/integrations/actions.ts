"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getIntegrationSettings,
  updateIntegrationSettings,
  integrationSettingsUpdateSchema,
  getDriveConfigWithGmail,
  updateDriveConfig,
  driveConfigUpdateSchema,
  getConnectionHealth,
} from "@/lib/data/integrations"

export async function getIntegrationsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [settings, driveConfig, health] = await Promise.all([
    getIntegrationSettings(ctx),
    getDriveConfigWithGmail(ctx),
    getConnectionHealth(ctx),
  ])

  return { settings, driveConfig, health }
}

export async function updateIntegrationSettingsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = integrationSettingsUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const result = await updateIntegrationSettings(ctx, parsed)
  revalidatePath("/admin/integrations")
  return result
}

export async function updateDriveConfigAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = driveConfigUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const result = await updateDriveConfig(ctx, parsed)
  revalidatePath("/admin/integrations")
  return result
}

export async function testConnectionAction(_provider: string) {
  const user = await requireUser()
  requireRole(user, "admin")

  return {
    provider: _provider,
    status: "unknown" as const,
    message: "Health check not yet implemented (Phase 5).",
  }
}
