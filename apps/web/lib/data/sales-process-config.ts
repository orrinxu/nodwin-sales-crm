import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface SalesProcessCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline Stage
// ═══════════════════════════════════════════════════════════════════════════════

export interface PipelineStage {
  id: string
  key: string
  label: string
  winProbability: number | null
  isWon: boolean
  isLost: boolean
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export const pipelineStageCreateSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be snake_case"),
  label: z.string().min(1).max(200),
  winProbability: z.number().int().min(0).max(100).nullable().optional(),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

export const pipelineStageUpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200).optional(),
  winProbability: z.number().int().min(0).max(100).nullable().optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
})

export type PipelineStageCreateInput = z.input<typeof pipelineStageCreateSchema>
export type PipelineStageUpdateInput = z.input<typeof pipelineStageUpdateSchema>

function toDomainPipelineStage(data: Record<string, unknown>): PipelineStage {
  return {
    id: data.id as string,
    key: data.key as string,
    label: data.label as string,
    winProbability: (data.win_probability as number | null) ?? null,
    isWon: (data.is_won as boolean) ?? false,
    isLost: (data.is_lost as boolean) ?? false,
    sortOrder: (data.sort_order as number) ?? 0,
    active: (data.active as boolean) ?? true,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getPipelineStages(
  ctx: SalesProcessCallContext,
): Promise<PipelineStage[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load pipeline stages: ${error.message}`)
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toDomainPipelineStage)
}

export async function createPipelineStage(
  ctx: SalesProcessCallContext,
  input: PipelineStageCreateInput,
): Promise<PipelineStage> {
  void ctx
  const parsed = pipelineStageCreateSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("pipeline_stages")
    .insert({
      key: parsed.key,
      label: parsed.label,
      win_probability: parsed.winProbability,
      is_won: parsed.isWon,
      is_lost: parsed.isLost,
      sort_order: parsed.sortOrder,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create pipeline stage: ${error.message}`)
  }
  return toDomainPipelineStage(data as Record<string, unknown>)
}

export async function updatePipelineStage(
  ctx: SalesProcessCallContext,
  input: PipelineStageUpdateInput,
): Promise<void> {
  void ctx
  const parsed = pipelineStageUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (parsed.label !== undefined) update.label = parsed.label
  if (parsed.winProbability !== undefined) update.win_probability = parsed.winProbability
  if (parsed.isWon !== undefined) update.is_won = parsed.isWon
  if (parsed.isLost !== undefined) update.is_lost = parsed.isLost
  if (parsed.sortOrder !== undefined) update.sort_order = parsed.sortOrder
  if (parsed.active !== undefined) update.active = parsed.active

  const { error } = await supabase
    .from("pipeline_stages")
    .update(update)
    .eq("id", parsed.id)

  if (error) {
    throw new Error(`Failed to update pipeline stage: ${error.message}`)
  }
}

export async function softDeletePipelineStage(
  ctx: SalesProcessCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("pipeline_stages")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to delete pipeline stage: ${error.message}`)
  }
}

export async function getStageLabelMap(): Promise<Record<string, string>> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("key, label")
    .eq("active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load stage labels: ${error.message}`)
  }

  const map: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{ key: string; label: string }>) {
    map[row.key] = row.label
  }
  return map
}

export async function reorderPipelineStages(
  ctx: SalesProcessCallContext,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  if (items.length === 0) return

  const { error } = await supabase
    .from("pipeline_stages")
    .upsert(items.map((item) => ({ id: item.id, sort_order: item.sortOrder })))

  if (error) {
    throw new Error(`Failed to reorder pipeline stages: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loss Reason
// ═══════════════════════════════════════════════════════════════════════════════

export interface LossReason {
  id: string
  label: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export const lossReasonCreateSchema = z.object({
  label: z.string().min(1).max(200),
  sortOrder: z.number().int().default(0),
})

export const lossReasonUpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
})

export type LossReasonCreateInput = z.input<typeof lossReasonCreateSchema>
export type LossReasonUpdateInput = z.input<typeof lossReasonUpdateSchema>

function toDomainLossReason(data: Record<string, unknown>): LossReason {
  return {
    id: data.id as string,
    label: data.label as string,
    sortOrder: (data.sort_order as number) ?? 0,
    active: (data.active as boolean) ?? true,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getLossReasons(
  ctx: SalesProcessCallContext,
): Promise<LossReason[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("loss_reasons")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load loss reasons: ${error.message}`)
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toDomainLossReason)
}

export async function createLossReason(
  ctx: SalesProcessCallContext,
  input: LossReasonCreateInput,
): Promise<LossReason> {
  void ctx
  const parsed = lossReasonCreateSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("loss_reasons")
    .insert({
      label: parsed.label,
      sort_order: parsed.sortOrder,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create loss reason: ${error.message}`)
  }
  return toDomainLossReason(data as Record<string, unknown>)
}

export async function updateLossReason(
  ctx: SalesProcessCallContext,
  input: LossReasonUpdateInput,
): Promise<void> {
  void ctx
  const parsed = lossReasonUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (parsed.label !== undefined) update.label = parsed.label
  if (parsed.sortOrder !== undefined) update.sort_order = parsed.sortOrder
  if (parsed.active !== undefined) update.active = parsed.active

  const { error } = await supabase
    .from("loss_reasons")
    .update(update)
    .eq("id", parsed.id)

  if (error) {
    throw new Error(`Failed to update loss reason: ${error.message}`)
  }
}

export async function softDeleteLossReason(
  ctx: SalesProcessCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("loss_reasons")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to delete loss reason: ${error.message}`)
  }
}

export async function reorderLossReasons(
  ctx: SalesProcessCallContext,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  if (items.length === 0) return

  const { error } = await supabase
    .from("loss_reasons")
    .upsert(items.map((item) => ({ id: item.id, sort_order: item.sortOrder })))

  if (error) {
    throw new Error(`Failed to reorder loss reasons: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Project Type
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectType {
  id: string
  key: string
  label: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export const projectTypeCreateSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be snake_case"),
  label: z.string().min(1).max(200),
  sortOrder: z.number().int().default(0),
})

export const projectTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
})

export type ProjectTypeCreateInput = z.input<typeof projectTypeCreateSchema>
export type ProjectTypeUpdateInput = z.input<typeof projectTypeUpdateSchema>

function toDomainProjectType(data: Record<string, unknown>): ProjectType {
  return {
    id: data.id as string,
    key: data.key as string,
    label: data.label as string,
    sortOrder: (data.sort_order as number) ?? 0,
    active: (data.active as boolean) ?? true,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getProjectTypes(
  ctx: SalesProcessCallContext,
): Promise<ProjectType[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("project_types")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load project types: ${error.message}`)
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toDomainProjectType)
}

export async function createProjectType(
  ctx: SalesProcessCallContext,
  input: ProjectTypeCreateInput,
): Promise<ProjectType> {
  void ctx
  const parsed = projectTypeCreateSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("project_types")
    .insert({
      key: parsed.key,
      label: parsed.label,
      sort_order: parsed.sortOrder,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create project type: ${error.message}`)
  }
  return toDomainProjectType(data as Record<string, unknown>)
}

export async function updateProjectType(
  ctx: SalesProcessCallContext,
  input: ProjectTypeUpdateInput,
): Promise<void> {
  void ctx
  const parsed = projectTypeUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (parsed.label !== undefined) update.label = parsed.label
  if (parsed.sortOrder !== undefined) update.sort_order = parsed.sortOrder
  if (parsed.active !== undefined) update.active = parsed.active

  const { error } = await supabase
    .from("project_types")
    .update(update)
    .eq("id", parsed.id)

  if (error) {
    throw new Error(`Failed to update project type: ${error.message}`)
  }
}

export async function softDeleteProjectType(
  ctx: SalesProcessCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("project_types")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to delete project type: ${error.message}`)
  }
}

export async function reorderProjectTypes(
  ctx: SalesProcessCallContext,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  if (items.length === 0) return

  const { error } = await supabase
    .from("project_types")
    .upsert(items.map((item) => ({ id: item.id, sort_order: item.sortOrder })))

  if (error) {
    throw new Error(`Failed to reorder project types: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Revenue Category
// ═══════════════════════════════════════════════════════════════════════════════

export interface RevenueCategory {
  id: string
  key: string
  label: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export const revenueCategoryCreateSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be snake_case"),
  label: z.string().min(1).max(200),
  sortOrder: z.number().int().default(0),
})

export const revenueCategoryUpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
})

export type RevenueCategoryCreateInput = z.input<typeof revenueCategoryCreateSchema>
export type RevenueCategoryUpdateInput = z.input<typeof revenueCategoryUpdateSchema>

function toDomainRevenueCategory(data: Record<string, unknown>): RevenueCategory {
  return {
    id: data.id as string,
    key: data.key as string,
    label: data.label as string,
    sortOrder: (data.sort_order as number) ?? 0,
    active: (data.active as boolean) ?? true,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getRevenueCategories(
  ctx: SalesProcessCallContext,
): Promise<RevenueCategory[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("revenue_categories")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load revenue categories: ${error.message}`)
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toDomainRevenueCategory)
}

export async function createRevenueCategory(
  ctx: SalesProcessCallContext,
  input: RevenueCategoryCreateInput,
): Promise<RevenueCategory> {
  void ctx
  const parsed = revenueCategoryCreateSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("revenue_categories")
    .insert({
      key: parsed.key,
      label: parsed.label,
      sort_order: parsed.sortOrder,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create revenue category: ${error.message}`)
  }
  return toDomainRevenueCategory(data as Record<string, unknown>)
}

export async function updateRevenueCategory(
  ctx: SalesProcessCallContext,
  input: RevenueCategoryUpdateInput,
): Promise<void> {
  void ctx
  const parsed = revenueCategoryUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (parsed.label !== undefined) update.label = parsed.label
  if (parsed.sortOrder !== undefined) update.sort_order = parsed.sortOrder
  if (parsed.active !== undefined) update.active = parsed.active

  const { error } = await supabase
    .from("revenue_categories")
    .update(update)
    .eq("id", parsed.id)

  if (error) {
    throw new Error(`Failed to update revenue category: ${error.message}`)
  }
}

export async function softDeleteRevenueCategory(
  ctx: SalesProcessCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("revenue_categories")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to delete revenue category: ${error.message}`)
  }
}

export async function reorderRevenueCategories(
  ctx: SalesProcessCallContext,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  if (items.length === 0) return

  const { error } = await supabase
    .from("revenue_categories")
    .upsert(items.map((item) => ({ id: item.id, sort_order: item.sortOrder })))

  if (error) {
    throw new Error(`Failed to reorder revenue categories: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stage Gate Rule
// ═══════════════════════════════════════════════════════════════════════════════

export const stageGateRuleEntityTypes = [
  "account",
  "contact",
  "opportunity",
  "activity",
] as const

export type StageGateRuleEntityType = (typeof stageGateRuleEntityTypes)[number]

export interface StageGateRule {
  id: string
  stageKey: string
  entityType: StageGateRuleEntityType
  fieldKey: string
  required: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export const stageGateRuleCreateSchema = z.object({
  stageKey: z.string().min(1),
  entityType: z.enum(stageGateRuleEntityTypes),
  fieldKey: z.string().min(1).max(100),
  required: z.boolean().default(true),
})

export const stageGateRuleUpdateSchema = z.object({
  id: z.string().uuid(),
  stageKey: z.string().min(1).optional(),
  entityType: z.enum(stageGateRuleEntityTypes).optional(),
  fieldKey: z.string().min(1).max(100).optional(),
  required: z.boolean().optional(),
  active: z.boolean().optional(),
})

export type StageGateRuleCreateInput = z.input<typeof stageGateRuleCreateSchema>
export type StageGateRuleUpdateInput = z.input<typeof stageGateRuleUpdateSchema>

function toDomainStageGateRule(data: Record<string, unknown>): StageGateRule {
  return {
    id: data.id as string,
    stageKey: data.stage_key as string,
    entityType: data.entity_type as StageGateRuleEntityType,
    fieldKey: data.field_key as string,
    required: (data.required as boolean) ?? true,
    active: (data.active as boolean) ?? true,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getStageGateRules(
  ctx: SalesProcessCallContext,
): Promise<StageGateRule[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("stage_gate_rules")
    .select("*")
    .order("stage_key", { ascending: true })

  if (error) {
    throw new Error(`Failed to load stage gate rules: ${error.message}`)
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toDomainStageGateRule)
}

export async function createStageGateRule(
  ctx: SalesProcessCallContext,
  input: StageGateRuleCreateInput,
): Promise<StageGateRule> {
  void ctx
  const parsed = stageGateRuleCreateSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("stage_gate_rules")
    .insert({
      stage_key: parsed.stageKey,
      entity_type: parsed.entityType,
      field_key: parsed.fieldKey,
      required: parsed.required,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create stage gate rule: ${error.message}`)
  }
  return toDomainStageGateRule(data as Record<string, unknown>)
}

export async function updateStageGateRule(
  ctx: SalesProcessCallContext,
  input: StageGateRuleUpdateInput,
): Promise<void> {
  void ctx
  const parsed = stageGateRuleUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (parsed.stageKey !== undefined) update.stage_key = parsed.stageKey
  if (parsed.entityType !== undefined) update.entity_type = parsed.entityType
  if (parsed.fieldKey !== undefined) update.field_key = parsed.fieldKey
  if (parsed.required !== undefined) update.required = parsed.required
  if (parsed.active !== undefined) update.active = parsed.active

  const { error } = await supabase
    .from("stage_gate_rules")
    .update(update)
    .eq("id", parsed.id)

  if (error) {
    throw new Error(`Failed to update stage gate rule: ${error.message}`)
  }
}

export async function softDeleteStageGateRule(
  ctx: SalesProcessCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("stage_gate_rules")
    .update({ active: false })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to delete stage gate rule: ${error.message}`)
  }
}
