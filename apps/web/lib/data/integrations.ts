import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface IntegrationsCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

// ═══════════════════════════════════════════════════════════════════════════════
// Entity (minimal — just what's needed for the integrations admin page)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EntitySummary {
  id: string
  name: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// Drive Config
// ═══════════════════════════════════════════════════════════════════════════════

export interface DriveConfigRecord {
  id: string | null
  entityId: string
  accountsParentFolderId: string | null
  opportunitiesParentFolderId: string | null
  pnlParentFolderId: string | null
}

export const driveConfigUpsertSchema = z.object({
  entityId: z.string().uuid(),
  accountsParentFolderId: z.string().max(500).nullable().optional(),
  opportunitiesParentFolderId: z.string().max(500).nullable().optional(),
  pnlParentFolderId: z.string().max(500).nullable().optional(),
})

export type DriveConfigUpsertInput = z.infer<typeof driveConfigUpsertSchema>

export async function listEntities(ctx: IntegrationsCallContext): Promise<EntitySummary[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("entities")
    .select("id, name")
    .eq("active", true)
    .order("name")

  if (error) {
    throw new Error(`Failed to load entities: ${error.message}`)
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
  }))
}

export async function getDriveConfigs(ctx: IntegrationsCallContext): Promise<DriveConfigRecord[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("drive_config")
    .select("id, entity_id, accounts_parent_folder_id, opportunities_parent_folder_id, pnl_parent_folder_id")

  if (error) {
    throw new Error(`Failed to load drive configs: ${error.message}`)
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string | null,
    entityId: row.entity_id as string,
    accountsParentFolderId: (row.accounts_parent_folder_id as string) ?? null,
    opportunitiesParentFolderId: (row.opportunities_parent_folder_id as string) ?? null,
    pnlParentFolderId: (row.pnl_parent_folder_id as string) ?? null,
  }))
}

export async function upsertDriveConfig(
  ctx: IntegrationsCallContext,
  input: DriveConfigUpsertInput,
): Promise<void> {
  const supabase = await createServerClient()

  const payload: Record<string, unknown> = {
    entity_id: input.entityId,
  }
  if (input.accountsParentFolderId !== undefined) {
    payload.accounts_parent_folder_id = input.accountsParentFolderId
  }
  if (input.opportunitiesParentFolderId !== undefined) {
    payload.opportunities_parent_folder_id = input.opportunitiesParentFolderId
  }
  if (input.pnlParentFolderId !== undefined) {
    payload.pnl_parent_folder_id = input.pnlParentFolderId
  }

  const { error } = await supabase
    .from("drive_config")
    .upsert(payload, { onConflict: "entity_id" })

  if (error) {
    throw new Error(`Failed to save drive config: ${error.message}`)
  }
}
