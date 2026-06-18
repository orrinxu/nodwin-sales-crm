"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { createServerClient } from "@/lib/supabase/server"
import {
  getNotificationRouting,
  upsertNotificationRouting,
  notificationRoutingUpsertSchema,
  getUserNotificationOverrides,
  upsertUserNotificationOverride,
  userNotificationOverrideUpsertSchema,
  getEmailTemplates,
  upsertEmailTemplate,
  emailTemplateUpsertSchema,
  getAllUserOverrides,
  type NotificationRoutingRecord,
  type UserNotificationOverrideRecord,
  type EmailTemplateRecord,
  type NotificationRoutingUpsertInput,
  type UserNotificationOverrideUpsertInput,
  type EmailTemplateUpsertInput,
} from "@/lib/data/notifications"

export async function getNotificationsAdminAction(): Promise<{
  routing: NotificationRoutingRecord[]
  templates: EmailTemplateRecord[]
  userOverrides: UserNotificationOverrideRecord[]
}> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [routing, templates, userOverrides] = await Promise.all([
    getNotificationRouting(ctx),
    getEmailTemplates(ctx),
    getAllUserOverrides(ctx),
  ])

  return { routing, templates, userOverrides }
}

export async function updateRoutingAction(
  input: unknown,
): Promise<NotificationRoutingRecord> {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = notificationRoutingUpsertSchema.parse(
    input,
  ) as NotificationRoutingUpsertInput
  const ctx = { user, source: "web" as const }
  const result = await upsertNotificationRouting(ctx, parsed)
  revalidatePath("/admin/notifications")
  return result
}

export async function updateEmailTemplateAction(
  input: unknown,
): Promise<EmailTemplateRecord> {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = emailTemplateUpsertSchema.parse(
    input,
  ) as EmailTemplateUpsertInput
  const ctx = { user, source: "web" as const }
  const result = await upsertEmailTemplate(ctx, parsed)
  revalidatePath("/admin/notifications")
  return result
}

export async function getUserOverridesAction(
  userId: string,
): Promise<UserNotificationOverrideRecord[]> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getUserNotificationOverrides(ctx, userId)
}

export async function updateUserOverrideAction(
  input: unknown,
): Promise<UserNotificationOverrideRecord> {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = userNotificationOverrideUpsertSchema.parse(
    input,
  ) as UserNotificationOverrideUpsertInput
  const ctx = { user, source: "web" as const }
  const result = await upsertUserNotificationOverride(ctx, parsed)
  revalidatePath("/admin/notifications")
  return result
}

export async function updateCommsTrackingAction(
  entityId: string,
  enabled: boolean,
): Promise<void> {
  const user = await requireUser()
  requireRole(user, "admin")

  const supabase = await createServerClient()
  const { error } = await supabase
    .from("entities")
    .update({ comms_tracking_enabled: enabled })
    .eq("id", entityId)

  if (error) {
    throw new Error(
      `Failed to update comms tracking for entity ${entityId}: ${error.message}`,
    )
  }

  revalidatePath("/admin/notifications")
}
