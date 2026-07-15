import "server-only"
/* eslint-disable @typescript-eslint/no-unused-vars */
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export type NotificationEventType =
  | "stage_change"
  | "deal_assigned"
  | "approval_requested"
  | "mention"
  | "deal_won"
  | "deal_lost"
  | "confidential_break_glass"
  | "direct_report_reassigned"

export type NotificationChannel = "in_app" | "email" | "slack"

export interface NotificationCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface NotificationRoutingRecord {
  id: string
  eventType: NotificationEventType
  channel: NotificationChannel
  enabled: boolean
  entityId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface UserNotificationOverrideRecord {
  id: string
  userId: string
  eventType: NotificationEventType
  channel: NotificationChannel
  enabled: boolean
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface EmailTemplateRecord {
  id: string
  name: string
  subject: string
  bodyHtml: string
  bodyText: string | null
  variables: string[]
  active: boolean
  entityId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface UserNotificationRecord {
  id: string
  userId: string
  title: string
  message: string
  linkUrl: string | null
  readAt: string | null
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  createdBy: string | null
  updatedBy: string | null
}

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  "stage_change",
  "deal_assigned",
  "approval_requested",
  "mention",
  "deal_won",
  "deal_lost",
  "confidential_break_glass",
  "direct_report_reassigned",
]

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "in_app",
  "email",
  "slack",
]

function toDomainRouting(data: Record<string, unknown>): NotificationRoutingRecord {
  return {
    id: data.id as string,
    eventType: data.event_type as NotificationEventType,
    channel: data.channel as NotificationChannel,
    enabled: data.enabled as boolean,
    entityId: (data.entity_id as string) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
  }
}

function toDomainOverride(
  data: Record<string, unknown>,
): UserNotificationOverrideRecord {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    eventType: data.event_type as NotificationEventType,
    channel: data.channel as NotificationChannel,
    enabled: data.enabled as boolean,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
  }
}

function toDomainTemplate(data: Record<string, unknown>): EmailTemplateRecord {
  return {
    id: data.id as string,
    name: data.name as string,
    subject: data.subject as string,
    bodyHtml: data.body_html as string,
    bodyText: (data.body_text as string) ?? null,
    variables: (data.variables ?? []) as string[],
    active: data.active as boolean,
    entityId: (data.entity_id as string) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
  }
}

function toDomainNotification(
  data: Record<string, unknown>,
): UserNotificationRecord {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    title: data.title as string,
    message: data.message as string,
    linkUrl: (data.link_url as string) ?? null,
    readAt: (data.read_at as string) ?? null,
    entityId: (data.entity_id as string) ?? null,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    createdBy: (data.created_by as string) ?? null,
    updatedBy: (data.updated_by as string) ?? null,
  }
}

export const notificationRoutingUpsertSchema = z.object({
  eventType: z.enum([
    "stage_change",
    "deal_assigned",
    "approval_requested",
    "mention",
    "deal_won",
    "deal_lost",
    "confidential_break_glass",
    "direct_report_reassigned",
  ]),
  channel: z.enum(["in_app", "email", "slack"]),
  enabled: z.boolean(),
  entityId: z.string().uuid().nullable().optional(),
})

export const userNotificationOverrideUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  eventType: z.enum([
    "stage_change",
    "deal_assigned",
    "approval_requested",
    "mention",
    "deal_won",
    "deal_lost",
    "confidential_break_glass",
    "direct_report_reassigned",
  ]),
  channel: z.enum(["in_app", "email", "slack"]),
  enabled: z.boolean(),
})

export const emailTemplateUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  bodyText: z.string().nullable().optional(),
  variables: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  entityId: z.string().uuid().nullable().optional(),
})

export type NotificationRoutingUpsertInput = z.infer<
  typeof notificationRoutingUpsertSchema
>
export type UserNotificationOverrideUpsertInput = z.infer<
  typeof userNotificationOverrideUpsertSchema
>
export type EmailTemplateUpsertInput = z.infer<
  typeof emailTemplateUpsertSchema
>

export async function getNotificationRouting(
  _ctx: NotificationCallContext,
  entityId?: string,
): Promise<NotificationRoutingRecord[]> {
  const supabase = await createServerClient()

  let query = supabase
    .from("notification_routing")
    .select("*")
    .order("event_type", { ascending: true })
    .order("channel", { ascending: true })

  if (entityId !== undefined) {
    query = query.or(`entity_id.eq.${entityId},entity_id.is.null`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to load notification routing: ${error.message}`)
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toDomainRouting)
}

export async function upsertNotificationRouting(
  ctx: NotificationCallContext,
  input: NotificationRoutingUpsertInput,
): Promise<NotificationRoutingRecord> {
  const supabase = await createServerClient()

  const payload: Record<string, unknown> = {
    event_type: input.eventType,
    channel: input.channel,
    enabled: input.enabled,
    entity_id: input.entityId ?? null,
    updated_by: ctx.user.id,
  }

  const { data, error } = await supabase
    .from("notification_routing")
    .upsert(payload as never, { onConflict: "event_type, channel, entity_id" })
    .select()
    .single()

  if (error) {
    throw new Error(
      `Failed to upsert notification routing: ${error.message}`,
    )
  }

  return toDomainRouting(data as Record<string, unknown>)
}

export async function getUserNotificationOverrides(
  _ctx: NotificationCallContext,
  userId: string,
): Promise<UserNotificationOverrideRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("user_notification_overrides")
    .select("*")
    .eq("user_id", userId)
    .order("event_type", { ascending: true })
    .order("channel", { ascending: true })

  if (error) {
    throw new Error(
      `Failed to load user notification overrides: ${error.message}`,
    )
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toDomainOverride)
}

export async function upsertUserNotificationOverride(
  ctx: NotificationCallContext,
  input: UserNotificationOverrideUpsertInput,
): Promise<UserNotificationOverrideRecord> {
  const supabase = await createServerClient()

  if (input.id) {
    const { data, error } = await supabase
      .from("user_notification_overrides")
      .update({
        user_id: input.userId,
        event_type: input.eventType,
        channel: input.channel,
        enabled: input.enabled,
        updated_by: ctx.user.id,
      })
      .eq("id", input.id)
      .select()
      .single()

    if (error) {
      throw new Error(
        `Failed to update user notification override: ${error.message}`,
      )
    }

    return toDomainOverride(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from("user_notification_overrides")
    .upsert(
      {
        user_id: input.userId,
        event_type: input.eventType,
        channel: input.channel,
        enabled: input.enabled,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
      },
      { onConflict: "user_id, event_type, channel" },
    )
    .select()
    .single()

  if (error) {
    throw new Error(
      `Failed to insert user notification override: ${error.message}`,
    )
  }

  return toDomainOverride(data as Record<string, unknown>)
}

export async function getEmailTemplates(
  _ctx: NotificationCallContext,
  activeOnly?: boolean,
): Promise<EmailTemplateRecord[]> {
  const supabase = await createServerClient()

  let query = supabase
    .from("email_templates")
    .select("*")
    .order("name", { ascending: true })

  if (activeOnly) {
    query = query.eq("active", true)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(
      `Failed to load email templates: ${error.message}`,
    )
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toDomainTemplate)
}

export async function upsertEmailTemplate(
  ctx: NotificationCallContext,
  input: EmailTemplateUpsertInput,
): Promise<EmailTemplateRecord> {
  const supabase = await createServerClient()

  const payload: Record<string, unknown> = {
    name: input.name,
    subject: input.subject,
    body_html: input.bodyHtml,
    body_text: input.bodyText ?? null,
    variables: input.variables ?? [],
    active: input.active ?? true,
    entity_id: input.entityId ?? null,
  }

  if (input.id) {
    const { data, error } = await supabase
      .from("email_templates")
      .update({ ...payload, updated_by: ctx.user.id } as never)
      .eq("id", input.id)
      .select()
      .single()

    if (error) {
      throw new Error(
        `Failed to update email template: ${error.message}`,
      )
    }

    return toDomainTemplate(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert({ ...payload, created_by: ctx.user.id, updated_by: ctx.user.id } as never)
    .select()
    .single()

  if (error) {
    throw new Error(
      `Failed to create email template: ${error.message}`,
    )
  }

  return toDomainTemplate(data as Record<string, unknown>)
}

export async function getUserNotifications(
  _ctx: NotificationCallContext,
  userId: string,
  unreadOnly?: boolean,
): Promise<{ notifications: UserNotificationRecord[]; total: number }> {
  const supabase = await createServerClient()

  let query = supabase
    .from("user_notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (unreadOnly) {
    query = query.is("read_at", null)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(
      `Failed to load user notifications: ${error.message}`,
    )
  }

  return {
    notifications: ((data ?? []) as Record<string, unknown>[]).map(
      toDomainNotification,
    ),
    total: count ?? 0,
  }
}

export async function markNotificationRead(
  ctx: NotificationCallContext,
  notificationId: string,
): Promise<void> {
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("user_notifications")
    .update({
      read_at: new Date().toISOString(),
      updated_by: ctx.user.id,
    })
    .eq("id", notificationId)

  if (error) {
    throw new Error(
      `Failed to mark notification as read: ${error.message}`,
    )
  }
}

export async function markAllNotificationsRead(
  ctx: NotificationCallContext,
  userId: string,
): Promise<void> {
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("user_notifications")
    .update({
      read_at: new Date().toISOString(),
      updated_by: ctx.user.id,
    })
    .eq("user_id", userId)
    .is("read_at", null)

  if (error) {
    throw new Error(
      `Failed to mark all notifications as read: ${error.message}`,
    )
  }
}

export async function getUnreadNotificationCount(
  _ctx: NotificationCallContext,
  userId: string,
): Promise<number> {
  const supabase = await createServerClient()

  const { count, error } = await supabase
    .from("user_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)

  if (error) {
    throw new Error(
      `Failed to count unread notifications: ${error.message}`,
    )
  }

  return count ?? 0
}

export async function getAllUserOverrides(
  _ctx: NotificationCallContext,
): Promise<UserNotificationOverrideRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("user_notification_overrides")
    .select("*")
    .order("user_id", { ascending: true })
    .order("event_type", { ascending: true })
    .order("channel", { ascending: true })

  if (error) {
    throw new Error(
      `Failed to load all user notification overrides: ${error.message}`,
    )
  }

  return ((data ?? []) as Record<string, unknown>[]).map(toDomainOverride)
}
