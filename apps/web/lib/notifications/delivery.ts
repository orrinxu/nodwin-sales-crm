import "server-only"
import { createServerClient } from "@supabase/ssr"
import { env } from "../security/env"
import type {
  NotificationEventType,
  NotificationChannel,
  NotificationRoutingRecord,
  UserNotificationOverrideRecord,
} from "../data/notifications"

function createServiceRoleClient() {
  return createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export interface NotificationPayload {
  title: string
  message: string
  linkUrl?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
}

function escapeSlackMrkdwn(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

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

export async function evaluateNotificationChannels(
  userId: string,
  eventType: NotificationEventType,
  entityId?: string,
): Promise<NotificationChannel[]> {
  const client = createServiceRoleClient()

  const { data: routingData, error: routingError } = await client
    .from("notification_routing")
    .select("*")
    .eq("event_type", eventType)
    .eq("enabled", true)

  if (routingError) {
    throw new Error(
      `Failed to load notification routing: ${routingError.message}`,
    )
  }

  const { data: overrideData, error: overrideError } = await client
    .from("user_notification_overrides")
    .select("*")
    .eq("user_id", userId)
    .eq("event_type", eventType)

  if (overrideError) {
    throw new Error(
      `Failed to load user overrides: ${overrideError.message}`,
    )
  }

  const routingRows = ((routingData ?? []) as Record<string, unknown>[]).map(
    toDomainRouting,
  )
  const overrideRows = ((overrideData ?? []) as Record<string, unknown>[]).map(
    toDomainOverride,
  )

  const overrideMap = new Map<string, boolean>()
  for (const ov of overrideRows) {
    overrideMap.set(ov.channel, ov.enabled)
  }

  const activeChannels: NotificationChannel[] = []

  for (const route of routingRows) {
    if (entityId !== undefined && route.entityId !== null && route.entityId !== entityId) {
      continue
    }

    if (route.entityId === null && entityId !== undefined) {
      const entitySpecificRoute = routingRows.find(
        (r) =>
          r.channel === route.channel &&
          r.eventType === route.eventType &&
          r.entityId === entityId,
      )
      if (entitySpecificRoute) {
        continue
      }
    }

    const resolvedEnabled = overrideMap.has(route.channel)
      ? overrideMap.get(route.channel)!
      : route.enabled

    if (resolvedEnabled) {
      activeChannels.push(route.channel)
    }
  }

  return [...new Set(activeChannels)]
}

export function renderEmailTemplate(
  template: { subject: string; bodyHtml: string; bodyText?: string | null },
  variables: Record<string, string>,
): { subject: string; bodyHtml: string; bodyText: string } {
  let subject = template.subject
  let bodyHtml = template.bodyHtml
  const bodyText = template.bodyText ?? ""

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
    subject = subject.replaceAll(placeholder, escaped)
    bodyHtml = bodyHtml.replaceAll(placeholder, escaped)
  }

  const renderedText = bodyText.replaceAll(
    /{{([\w-]+)}}/g,
    (match, varName) => variables[varName] ?? match,
  )

  return { subject, bodyHtml, bodyText: renderedText }
}

export async function sendEmailNotification(
  userId: string,
  subject: string,
  bodyHtml: string,
  bodyText: string,
): Promise<void> {
  const client = createServiceRoleClient()

  const { data: userData, error: userError } = await client
    .from("users")
    .select("email")
    .eq("id", userId)
    .single()

  if (userError || !userData) {
    throw new Error(
      `Cannot send email notification: user ${userId} not found`,
    )
  }

  const email = (userData as { email: string }).email

  if (!env.RESEND_API_KEY) {
    console.warn(
      "[notifications] RESEND_API_KEY not configured; email notification queued as log only",
    )
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Nodwin CRM <notifications@${env.RESEND_DOMAIN ?? "crm.nodwin.com"}>`,
      to: [email],
      subject,
      html: bodyHtml,
      text: bodyText,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Failed to send email notification via Resend: ${response.status} ${errorBody}`,
    )
  }
}

export async function sendSlackNotification(
  userId: string,
  message: string,
): Promise<void> {
  const client = createServiceRoleClient()

  const { data: connections, error: connError } = await client
    .from("slack_connections")
    .select("slack_user_id, access_token")
    .eq("user_id", userId)
    .eq("enabled", true)

  if (connError) {
    throw new Error(
      `Failed to load Slack connection: ${connError.message}`,
    )
  }

  if (!connections || connections.length === 0) {
    return
  }

  if (!env.SLACK_BOT_TOKEN) {
    console.warn(
      "[notifications] SLACK_BOT_TOKEN not configured; Slack notification skipped",
    )
    return
  }

  for (const conn of connections as { slack_user_id: string; access_token?: string }[]) {
    try {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: conn.slack_user_id,
          text: message,
        }),
      })

      if (!response.ok) {
        console.warn(
          `[notifications] Slack message failed for user ${userId}: ${response.status}`,
        )
      }
    } catch (err) {
      console.warn(
        `[notifications] Slack message error for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}

export async function createInAppNotification(
  userId: string,
  title: string,
  message: string,
  linkUrl?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const client = createServiceRoleClient()

  const { data, error } = await client
    .from("user_notifications")
    .insert({
      user_id: userId,
      title,
      message,
      link_url: linkUrl ?? null,
      entity_id: entityId ?? null,
      metadata: (metadata ?? {}) as Record<string, unknown>,
    })
    .select("id")
    .single()

  if (error) {
    throw new Error(`Failed to create in-app notification: ${error.message}`)
  }

  return data.id
}

export async function sendNotification(
  userId: string,
  eventType: NotificationEventType,
  payload: NotificationPayload,
): Promise<void> {
  const channels = await evaluateNotificationChannels(
    userId,
    eventType,
    payload.entityId,
  )

  const results = await Promise.allSettled(
    channels.map((channel) => {
      switch (channel) {
        case "in_app":
          return createInAppNotification(
            userId,
            payload.title,
            payload.message,
            payload.linkUrl,
            payload.entityId,
            payload.metadata,
          )
        case "email":
          return sendEmailNotification(
            userId,
            escapeHtml(payload.title),
            `<p>${escapeHtml(payload.message)}</p>${payload.linkUrl ? `<p><a href="${escapeHtml(payload.linkUrl)}">View in Nodwin CRM</a></p>` : ""}`,
            payload.message,
          )
        case "slack":
          return sendSlackNotification(
            userId,
            `*${escapeSlackMrkdwn(payload.title)}*\n${escapeSlackMrkdwn(payload.message)}${payload.linkUrl ? `\n<${escapeSlackMrkdwn(payload.linkUrl)}|View in Nodwin CRM>` : ""}`,
          )
      }
    }),
  )

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        `[notifications] Channel delivery failed for user ${userId}, event ${eventType}: ${result.reason}`,
      )
    }
  }
}
