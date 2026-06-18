"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getSlackConnections,
  getEmailSettings,
  getSalesforceConnections,
  getDriveConfig,
  updateDriveConfig,
  driveConfigUpdateSchema,
  updateSlackConnection,
  slackConnectionUpdateSchema,
} from "@/lib/data/integrations"

export async function getIntegrationsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [slackConnections, emailSettings, salesforceConnections, driveConfig] = await Promise.all([
    getSlackConnections(ctx),
    getEmailSettings(ctx),
    getSalesforceConnections(ctx),
    getDriveConfig(ctx),
  ])

  return { slackConnections, emailSettings, salesforceConnections, driveConfig }
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

export async function updateSlackConnectionAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = slackConnectionUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const result = await updateSlackConnection(ctx, parsed)
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
