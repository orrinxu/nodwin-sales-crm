"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  createPipelineStage,
  pipelineStageCreateSchema,
  createLossReason,
  lossReasonCreateSchema,
  createProjectType,
  projectTypeCreateSchema,
  createRevenueCategory,
  revenueCategoryCreateSchema,
  createStageGateRule,
  stageGateRuleCreateSchema,
  getLossReasons,
  getPipelineStages,
  getProjectTypes,
  getRevenueCategories,
  getStageGateRules,
  reorderPipelineStages,
  reorderLossReasons,
  reorderProjectTypes,
  reorderRevenueCategories,
  softDeletePipelineStage,
  softDeleteLossReason,
  softDeleteProjectType,
  softDeleteRevenueCategory,
  softDeleteStageGateRule,
  updatePipelineStage,
  pipelineStageUpdateSchema,
  updateLossReason,
  lossReasonUpdateSchema,
  updateProjectType,
  projectTypeUpdateSchema,
  updateRevenueCategory,
  revenueCategoryUpdateSchema,
  updateStageGateRule,
  stageGateRuleUpdateSchema,
} from "@/lib/data/sales-process-config"

// ── Pipeline Stages ──────────────────────────────────────────────────────────

export async function getPipelineStagesAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getPipelineStages(ctx)
}

export async function createPipelineStageAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = pipelineStageCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createPipelineStage(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function updatePipelineStageAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = pipelineStageUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updatePipelineStage(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function softDeletePipelineStageAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await softDeletePipelineStage(ctx, id)
  revalidatePath("/admin/sales-process")
}

export async function reorderPipelineStagesAction(items: { id: string; sortOrder: number }[]) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await reorderPipelineStages(ctx, items)
  revalidatePath("/admin/sales-process")
}

// ── Loss Reasons ─────────────────────────────────────────────────────────────

export async function getLossReasonsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getLossReasons(ctx)
}

export async function createLossReasonAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = lossReasonCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createLossReason(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function updateLossReasonAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = lossReasonUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateLossReason(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function softDeleteLossReasonAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await softDeleteLossReason(ctx, id)
  revalidatePath("/admin/sales-process")
}

export async function reorderLossReasonsAction(items: { id: string; sortOrder: number }[]) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await reorderLossReasons(ctx, items)
  revalidatePath("/admin/sales-process")
}

// ── Project Types ────────────────────────────────────────────────────────────

export async function getProjectTypesAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getProjectTypes(ctx)
}

export async function createProjectTypeAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = projectTypeCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createProjectType(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function updateProjectTypeAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = projectTypeUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateProjectType(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function softDeleteProjectTypeAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await softDeleteProjectType(ctx, id)
  revalidatePath("/admin/sales-process")
}

export async function reorderProjectTypesAction(items: { id: string; sortOrder: number }[]) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await reorderProjectTypes(ctx, items)
  revalidatePath("/admin/sales-process")
}

// ── Revenue Categories ───────────────────────────────────────────────────────

export async function getRevenueCategoriesAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getRevenueCategories(ctx)
}

export async function createRevenueCategoryAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = revenueCategoryCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createRevenueCategory(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function updateRevenueCategoryAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = revenueCategoryUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateRevenueCategory(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function softDeleteRevenueCategoryAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await softDeleteRevenueCategory(ctx, id)
  revalidatePath("/admin/sales-process")
}

export async function reorderRevenueCategoriesAction(items: { id: string; sortOrder: number }[]) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await reorderRevenueCategories(ctx, items)
  revalidatePath("/admin/sales-process")
}

// ── Stage Gate Rules ─────────────────────────────────────────────────────────

export async function getStageGateRulesAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getStageGateRules(ctx)
}

export async function createStageGateRuleAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = stageGateRuleCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await createStageGateRule(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function updateStageGateRuleAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = stageGateRuleUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateStageGateRule(ctx, parsed)
  revalidatePath("/admin/sales-process")
}

export async function softDeleteStageGateRuleAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await softDeleteStageGateRule(ctx, id)
  revalidatePath("/admin/sales-process")
}
