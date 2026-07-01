"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getAllApprovalThresholds,
  upsertApprovalThreshold,
  deleteApprovalThreshold,
  approvalThresholdCreateSchema,
} from "@/lib/data/approval-thresholds"

export async function getAllApprovalThresholdsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  return getAllApprovalThresholds()
}

export async function upsertApprovalThresholdAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = approvalThresholdCreateSchema.parse(input)
  const record = await upsertApprovalThreshold(parsed)
  revalidatePath("/admin/financial/approval-thresholds")
  return record
}

export async function deleteApprovalThresholdAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  await deleteApprovalThreshold(id)
  revalidatePath("/admin/financial/approval-thresholds")
}
