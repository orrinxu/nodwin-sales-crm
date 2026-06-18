import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface DataManagementCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface FinanceExportConfigRecord {
  id: string
  entityId: string
  entityName: string | null
  destinationDriveFolderId: string | null
  format: Record<string, unknown>
  schedule: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export const financeExportConfigCreateSchema = z.object({
  entityId: z.string().uuid("Entity is required"),
  destinationDriveFolderId: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal("")),
  format: z.record(z.string(), z.unknown()).optional().default({}),
  schedule: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .or(z.literal("")),
  enabled: z.boolean().default(false),
})

export const financeExportConfigUpdateSchema = z.object({
  destinationDriveFolderId: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal("")),
  format: z.record(z.string(), z.unknown()).optional(),
  schedule: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .or(z.literal("")),
  enabled: z.boolean().optional(),
})

export type FinanceExportConfigCreateInput = z.input<
  typeof financeExportConfigCreateSchema
>
export type FinanceExportConfigUpdateInput = z.input<
  typeof financeExportConfigUpdateSchema
>

export interface ImportJobRecord {
  id: string
  entityId: string | null
  entityName: string | null
  kind: "export" | "import"
  targetEntityType: string | null
  status: "pending" | "running" | "completed" | "failed"
  fileUrl: string | null
  driveFileId: string | null
  recordCount: number | null
  errorLog: unknown | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export const importJobCreateSchema = z.object({
  entityId: z.string().uuid().nullable().optional(),
  kind: z.enum(["export", "import"]),
  targetEntityType: z.string().nullable().optional(),
  status: z
    .enum(["pending", "running", "completed", "failed"])
    .default("pending"),
})

export type ImportJobCreateInput = z.input<typeof importJobCreateSchema>

function toDomainFinanceExportConfig(
  data: Record<string, unknown>,
): FinanceExportConfigRecord {
  const entity =
    (data.entities as Record<string, unknown> | null) ?? null
  return {
    id: data.id as string,
    entityId: data.entity_id as string,
    entityName: (entity?.name as string) ?? null,
    destinationDriveFolderId:
      (data.destination_drive_folder_id as string) ?? null,
    format: (data.format ?? {}) as Record<string, unknown>,
    schedule: (data.schedule as string) ?? null,
    enabled: (data.enabled as boolean) ?? false,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

function toDomainImportJob(
  data: Record<string, unknown>,
): ImportJobRecord {
  const entity =
    (data.entities as Record<string, unknown> | null) ?? null
  return {
    id: data.id as string,
    entityId: (data.entity_id as string) ?? null,
    entityName: (entity?.name as string) ?? null,
    kind: data.kind as "export" | "import",
    targetEntityType: (data.target_entity_type as string) ?? null,
    status: data.status as ImportJobRecord["status"],
    fileUrl: (data.file_url as string) ?? null,
    driveFileId: (data.drive_file_id as string) ?? null,
    recordCount: (data.record_count as number) ?? null,
    errorLog: data.error_log ?? null,
    createdBy: data.created_by as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

function toDbFinanceExportConfig(
  input: FinanceExportConfigCreateInput | FinanceExportConfigUpdateInput,
): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  if ("entityId" in input && input.entityId !== undefined)
    db.entity_id = input.entityId
  if (
    "destinationDriveFolderId" in input &&
    input.destinationDriveFolderId !== undefined
  )
    db.destination_drive_folder_id = input.destinationDriveFolderId || null
  if ("format" in input && input.format !== undefined)
    db.format = input.format
  if ("schedule" in input && input.schedule !== undefined)
    db.schedule = input.schedule || null
  if ("enabled" in input && input.enabled !== undefined)
    db.enabled = input.enabled
  return db
}

export async function getAllFinanceExportConfigs(
  ctx: DataManagementCallContext,
): Promise<FinanceExportConfigRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("finance_export_config")
    .select("*, entities(name)")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(
      `Failed to load export configs: ${error.message}`,
    )
  }

  return (data ?? []).map((r) =>
    toDomainFinanceExportConfig(r as Record<string, unknown>),
  )
}

export async function getFinanceExportConfigById(
  ctx: DataManagementCallContext,
  id: string,
): Promise<FinanceExportConfigRecord | null> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("finance_export_config")
    .select("*, entities(name)")
    .eq("id", id)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(
      `Failed to load export config: ${error.message}`,
    )
  }

  return toDomainFinanceExportConfig(data as Record<string, unknown>)
}

export async function createFinanceExportConfig(
  ctx: DataManagementCallContext,
  input: FinanceExportConfigCreateInput,
): Promise<FinanceExportConfigRecord> {
  const parsed = financeExportConfigCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbFinanceExportConfig(parsed)

  const { data, error } = await supabase
    .from("finance_export_config")
    .upsert(dbData, { onConflict: "entity_id" })
    .select("*, entities(name)")
    .single()

  if (error) {
    throw new Error(
      `Failed to create export config: ${error.message}`,
    )
  }

  return toDomainFinanceExportConfig(data as Record<string, unknown>)
}

export async function updateFinanceExportConfig(
  ctx: DataManagementCallContext,
  id: string,
  input: FinanceExportConfigUpdateInput,
): Promise<FinanceExportConfigRecord> {
  const parsed = financeExportConfigUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbFinanceExportConfig(parsed)

  if (Object.keys(dbData).length === 0) {
    const config = await getFinanceExportConfigById(ctx, id)
    if (!config) throw new Error("Export config not found")
    return config
  }

  const { error } = await supabase
    .from("finance_export_config")
    .update(dbData)
    .eq("id", id)

  if (error) {
    throw new Error(
      `Failed to update export config: ${error.message}`,
    )
  }

  const config = await getFinanceExportConfigById(ctx, id)
  if (!config) throw new Error("Export config not found after update")
  return config
}

export async function deleteFinanceExportConfig(
  ctx: DataManagementCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("finance_export_config")
    .delete()
    .eq("id", id)

  if (error) {
    throw new Error(
      `Failed to delete export config: ${error.message}`,
    )
  }
}

export async function getImportJobs(
  ctx: DataManagementCallContext,
): Promise<ImportJobRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("import_jobs")
    .select("*, entities(name)")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Failed to load import jobs: ${error.message}`)
  }

  return (data ?? []).map((r) =>
    toDomainImportJob(r as Record<string, unknown>),
  )
}

export async function createImportJob(
  ctx: DataManagementCallContext,
  input: ImportJobCreateInput,
): Promise<ImportJobRecord> {
  const parsed = importJobCreateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {
    entity_id: parsed.entityId ?? null,
    kind: parsed.kind,
    target_entity_type: parsed.targetEntityType ?? null,
    status: parsed.status,
    created_by: ctx.user.id,
  }

  const { data, error } = await supabase
    .from("import_jobs")
    .insert(dbData)
    .select("*, entities(name)")
    .single()

  if (error) {
    throw new Error(
      `Failed to create import job: ${error.message}`,
    )
  }

  return toDomainImportJob(data as Record<string, unknown>)
}
