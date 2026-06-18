import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrationCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface SlackConnectionRecord {
  id: string
  workspaceId: string
  workspaceName: string | null
  eventRouting: Record<string, unknown>
  status: string
  createdAt: string
  updatedAt: string
}

export interface EmailSettingsRecord {
  id: string
  resendDomain: string | null
  inboundDomain: string | null
  templateConfig: Record<string, unknown>
  status: string
  createdAt: string
  updatedAt: string
}

export interface SalesforceConnectionRecord {
  id: string
  instanceUrl: string | null
  oauthState: Record<string, unknown>
  importStatus: string
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DriveConfigRecord {
  id: string
  entityId: string
  accountsParentFolderId: string | null
  opportunitiesParentFolderId: string | null
  pnlParentFolderId: string | null
  gmailSyncEnabled: boolean
  sheetsAccessEnabled: boolean
  docsAccessEnabled: boolean
  slidesAccessEnabled: boolean
  createdAt: string
  updatedAt: string
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const driveConfigUpdateSchema = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid().optional(),
  accountsParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  opportunitiesParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  pnlParentFolderId: z.string().max(500).nullable().optional().or(z.literal("")),
  gmailSyncEnabled: z.boolean().optional(),
  sheetsAccessEnabled: z.boolean().optional(),
  docsAccessEnabled: z.boolean().optional(),
  slidesAccessEnabled: z.boolean().optional(),
})

export type DriveConfigUpdateInput = z.infer<typeof driveConfigUpdateSchema>

// ── Domain mappers ────────────────────────────────────────────────────────────

function toDomainSlackConnection(data: Record<string, unknown>): SlackConnectionRecord {
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    workspaceName: (data.workspace_name as string) ?? null,
    eventRouting: (data.event_routing as Record<string, unknown>) ?? {},
    status: data.status as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

function toDomainEmailSettings(data: Record<string, unknown>): EmailSettingsRecord {
  return {
    id: data.id as string,
    resendDomain: (data.resend_domain as string) ?? null,
    inboundDomain: (data.inbound_domain as string) ?? null,
    templateConfig: (data.template_config as Record<string, unknown>) ?? {},
    status: data.status as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

function toDomainSalesforceConnection(data: Record<string, unknown>): SalesforceConnectionRecord {
  return {
    id: data.id as string,
    instanceUrl: (data.instance_url as string) ?? null,
    oauthState: (data.oauth_state as Record<string, unknown>) ?? {},
    importStatus: data.import_status as string,
    lastSyncAt: (data.last_sync_at as string) ?? null,
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
    gmailSyncEnabled: (data.gmail_sync_enabled as boolean) ?? false,
    sheetsAccessEnabled: (data.sheets_access_enabled as boolean) ?? false,
    docsAccessEnabled: (data.docs_access_enabled as boolean) ?? false,
    slidesAccessEnabled: (data.slides_access_enabled as boolean) ?? false,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

// ── Slack connections ─────────────────────────────────────────────────────────

export async function getSlackConnections(
  _ctx: IntegrationCallContext,
): Promise<SlackConnectionRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("slack_connections")
    .select("id, workspace_id, workspace_name, event_routing, status, created_at, updated_at")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to load Slack connections: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainSlackConnection(r as Record<string, unknown>))
}

// ── Email settings ────────────────────────────────────────────────────────────

export async function getEmailSettings(
  _ctx: IntegrationCallContext,
): Promise<EmailSettingsRecord | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("email_settings")
    .select("id, resend_domain, inbound_domain, template_config, status, created_at, updated_at")
    .limit(1)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(`Failed to load email settings: ${error.message}`)
  }

  return toDomainEmailSettings(data as Record<string, unknown>)
}

// ── Salesforce connections ────────────────────────────────────────────────────

export async function getSalesforceConnections(
  _ctx: IntegrationCallContext,
): Promise<SalesforceConnectionRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("salesforce_connections")
    .select("id, instance_url, oauth_state, import_status, last_sync_at, created_at, updated_at")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to load Salesforce connections: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainSalesforceConnection(r as Record<string, unknown>))
}

// ── Drive config ──────────────────────────────────────────────────────────────

export async function getDriveConfig(
  _ctx: IntegrationCallContext,
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
      gmail_sync_enabled,
      sheets_access_enabled,
      docs_access_enabled,
      slides_access_enabled,
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
  _ctx: IntegrationCallContext,
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
  if (parsed.gmailSyncEnabled !== undefined) {
    dbData.gmail_sync_enabled = parsed.gmailSyncEnabled
  }
  if (parsed.sheetsAccessEnabled !== undefined) {
    dbData.sheets_access_enabled = parsed.sheetsAccessEnabled
  }
  if (parsed.docsAccessEnabled !== undefined) {
    dbData.docs_access_enabled = parsed.docsAccessEnabled
  }
  if (parsed.slidesAccessEnabled !== undefined) {
    dbData.slides_access_enabled = parsed.slidesAccessEnabled
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
      gmail_sync_enabled,
      sheets_access_enabled,
      docs_access_enabled,
      slides_access_enabled,
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

// ── Slack connection update ───────────────────────────────────────────────────

export const slackConnectionUpdateSchema = z.object({
  id: z.string().uuid(),
  workspaceName: z.string().max(200).optional(),
  eventRouting: z.record(z.unknown()).optional(),
  status: z.enum(["disconnected", "connecting", "connected", "error"]).optional(),
})

export type SlackConnectionUpdateInput = z.infer<typeof slackConnectionUpdateSchema>

export async function updateSlackConnection(
  _ctx: IntegrationCallContext,
  input: SlackConnectionUpdateInput,
): Promise<SlackConnectionRecord> {
  const parsed = slackConnectionUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}

  if (parsed.workspaceName !== undefined) dbData.workspace_name = parsed.workspaceName
  if (parsed.eventRouting !== undefined) dbData.event_routing = parsed.eventRouting
  if (parsed.status !== undefined) dbData.status = parsed.status

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("slack_connections")
      .update(dbData)
      .eq("id", parsed.id)

    if (error) {
      throw new Error(`Failed to update Slack connection: ${error.message}`)
    }
  }

  const { data, error: fetchError } = await supabase
    .from("slack_connections")
    .select("id, workspace_id, workspace_name, event_routing, status, created_at, updated_at")
    .eq("id", parsed.id)
    .single()

  if (fetchError || !data) {
    throw new Error(`Failed to load updated Slack connection: ${fetchError?.message ?? "not found"}`)
  }

  return toDomainSlackConnection(data as Record<string, unknown>)
}

// ── Salesforce connection update ──────────────────────────────────────────────

export const salesforceConnectionUpdateSchema = z.object({
  id: z.string().uuid(),
  instanceUrl: z.string().max(500).optional(),
  importStatus: z.enum(["disconnected", "connecting", "connected", "importing", "error"]).optional(),
})

export type SalesforceConnectionUpdateInput = z.infer<typeof salesforceConnectionUpdateSchema>

export async function updateSalesforceConnection(
  _ctx: IntegrationCallContext,
  input: SalesforceConnectionUpdateInput,
): Promise<SalesforceConnectionRecord> {
  const parsed = salesforceConnectionUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}

  if (parsed.instanceUrl !== undefined) dbData.instance_url = parsed.instanceUrl
  if (parsed.importStatus !== undefined) dbData.import_status = parsed.importStatus

  if (Object.keys(dbData).length > 0) {
    const { error } = await supabase
      .from("salesforce_connections")
      .update(dbData)
      .eq("id", parsed.id)

    if (error) {
      throw new Error(`Failed to update Salesforce connection: ${error.message}`)
    }
  }

  const { data, error: fetchError } = await supabase
    .from("salesforce_connections")
    .select("id, instance_url, oauth_state, import_status, last_sync_at, created_at, updated_at")
    .eq("id", parsed.id)
    .single()

  if (fetchError || !data) {
    throw new Error(`Failed to load updated Salesforce connection: ${fetchError?.message ?? "not found"}`)
  }

  return toDomainSalesforceConnection(data as Record<string, unknown>)
}
