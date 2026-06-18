import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrationCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface IntegrationSettingRecord {
  id: string
  entityId: string
  provider: string
  enabled: boolean
  config: Record<string, unknown>
  healthStatus: string
  lastHealthCheckAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DriveConfigRecord {
  id: string
  entityId: string
  accountsParentFolderId: string | null
  opportunitiesParentFolderId: string | null
  pnlParentFolderId: string | null
  gmailParentFolderId: string | null
  sheetsParentFolderId: string | null
  docsParentFolderId: string | null
  slidesParentFolderId: string | null
  createdAt: string
  updatedAt: string
}

export interface ConnectionHealthRecord {
  provider: string
  entityId: string
  entityName: string | null
  healthStatus: string
  lastHealthCheckAt: string | null
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const INTEGRATION_PROVIDERS = [
  "gmail",
  "google_sheets",
  "google_docs",
  "google_slides",
  "google_drive",
  "slack",
  "resend",
  "salesforce",
] as const

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]

export const integrationSettingsUpdateSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export type IntegrationSettingsUpdateInput = z.infer<typeof integrationSettingsUpdateSchema>

export const driveConfigUpdateSchema = z.object({
  id: z.string().uuid(),
  accountsParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  opportunitiesParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  pnlParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  gmailParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  sheetsParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  docsParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  slidesParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
})

export type DriveConfigUpdateInput = z.infer<typeof driveConfigUpdateSchema>

// ── Domain mappers ────────────────────────────────────────────────────────────

function toDomainSetting(data: Record<string, unknown>): IntegrationSettingRecord {
  return {
    id: data.id as string,
    entityId: data.entity_id as string,
    provider: data.provider as string,
    enabled: data.enabled as boolean,
    config: (data.config ?? {}) as Record<string, unknown>,
    healthStatus: data.health_status as string,
    lastHealthCheckAt: (data.last_health_check_at as string) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

function toDomainDriveConfig(data: Record<string, unknown>): DriveConfigRecord {
  return {
    id: data.id as string,
    entityId: data.entity_id as string,
    accountsParentFolderId: (data.accounts_parent_folder_id as string) ?? null,
    opportunitiesParentFolderId: (data.opportunities_parent_folder_id as string) ?? null,
    pnlParentFolderId: (data.pnl_parent_folder_id as string) ?? null,
    gmailParentFolderId: (data.gmail_parent_folder_id as string) ?? null,
    sheetsParentFolderId: (data.sheets_parent_folder_id as string) ?? null,
    docsParentFolderId: (data.docs_parent_folder_id as string) ?? null,
    slidesParentFolderId: (data.slides_parent_folder_id as string) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

// ── Integration connections ───────────────────────────────────────────────────

export async function getIntegrationSettings(
  ctx: IntegrationCallContext,
): Promise<IntegrationSettingRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("integration_connections")
    .select(
      `
      id,
      entity_id,
      provider,
      enabled,
      config,
      health_status,
      last_health_check_at,
      created_at,
      updated_at
    `,
    )
    .order("provider", { ascending: true })

  if (error) {
    throw new Error(`Failed to load integration settings: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainSetting(r as Record<string, unknown>))
}

export async function updateIntegrationSettings(
  ctx: IntegrationCallContext,
  input: IntegrationSettingsUpdateInput,
): Promise<IntegrationSettingRecord> {
  const parsed = integrationSettingsUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}

  if (parsed.enabled !== undefined) dbData.enabled = parsed.enabled
  if (parsed.config !== undefined) dbData.config = parsed.config

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("integration_connections")
      .update(dbData)
      .eq("id", parsed.id)

    if (error) {
      throw new Error(`Failed to update integration settings: ${error.message}`)
    }
  }

  const { data, error: fetchError } = await supabase
    .from("integration_connections")
    .select(
      `
      id,
      entity_id,
      provider,
      enabled,
      config,
      health_status,
      last_health_check_at,
      created_at,
      updated_at
    `,
    )
    .eq("id", parsed.id)
    .single()

  if (fetchError || !data) {
    throw new Error(`Failed to load updated integration settings: ${fetchError?.message ?? "not found"}`)
  }

  return toDomainSetting(data as Record<string, unknown>)
}

// ── Drive config ──────────────────────────────────────────────────────────────

export async function getDriveConfigWithGmail(
  ctx: IntegrationCallContext,
): Promise<DriveConfigRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("drive_config")
    .select(
      `
      id,
      entity_id,
      accounts_parent_folder_id,
      opportunities_parent_folder_id,
      pnl_parent_folder_id,
      gmail_parent_folder_id,
      sheets_parent_folder_id,
      docs_parent_folder_id,
      slides_parent_folder_id,
      created_at,
      updated_at
    `,
    )
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to load drive config: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainDriveConfig(r as Record<string, unknown>))
}

export async function updateDriveConfig(
  ctx: IntegrationCallContext,
  input: DriveConfigUpdateInput,
): Promise<DriveConfigRecord> {
  const parsed = driveConfigUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}

  if (parsed.accountsParentFolderId !== undefined) {
    dbData.accounts_parent_folder_id = parsed.accountsParentFolderId || null
  }
  if (parsed.opportunitiesParentFolderId !== undefined) {
    dbData.opportunities_parent_folder_id = parsed.opportunitiesParentFolderId || null
  }
  if (parsed.pnlParentFolderId !== undefined) {
    dbData.pnl_parent_folder_id = parsed.pnlParentFolderId || null
  }
  if (parsed.gmailParentFolderId !== undefined) {
    dbData.gmail_parent_folder_id = parsed.gmailParentFolderId || null
  }
  if (parsed.sheetsParentFolderId !== undefined) {
    dbData.sheets_parent_folder_id = parsed.sheetsParentFolderId || null
  }
  if (parsed.docsParentFolderId !== undefined) {
    dbData.docs_parent_folder_id = parsed.docsParentFolderId || null
  }
  if (parsed.slidesParentFolderId !== undefined) {
    dbData.slides_parent_folder_id = parsed.slidesParentFolderId || null
  }

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("drive_config")
      .update(dbData)
      .eq("id", parsed.id)

    if (error) {
      throw new Error(`Failed to update drive config: ${error.message}`)
    }
  }

  const { data, error: fetchError } = await supabase
    .from("drive_config")
    .select(
      `
      id,
      entity_id,
      accounts_parent_folder_id,
      opportunities_parent_folder_id,
      pnl_parent_folder_id,
      gmail_parent_folder_id,
      sheets_parent_folder_id,
      docs_parent_folder_id,
      slides_parent_folder_id,
      created_at,
      updated_at
    `,
    )
    .eq("id", parsed.id)
    .single()

  if (fetchError || !data) {
    throw new Error(`Failed to load updated drive config: ${fetchError?.message ?? "not found"}`)
  }

  return toDomainDriveConfig(data as Record<string, unknown>)
}

// ── Connection health ─────────────────────────────────────────────────────────

export async function getConnectionHealth(
  ctx: IntegrationCallContext,
): Promise<ConnectionHealthRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("integration_connections")
    .select(
      `
      provider,
      entity_id,
      health_status,
      last_health_check_at,
      entity:entity_id ( name )
    `,
    )
    .order("provider", { ascending: true })

  if (error) {
    throw new Error(`Failed to load connection health: ${error.message}`)
  }

  return (data ?? []).map((r) => {
    const entity = (Array.isArray(r.entity) ? r.entity[0] : r.entity) as { name: string } | null
    return {
      provider: r.provider as string,
      entityId: r.entity_id as string,
      entityName: entity?.name ?? null,
      healthStatus: r.health_status as string,
      lastHealthCheckAt: (r.last_health_check_at as string) ?? null,
    }
  })
}
