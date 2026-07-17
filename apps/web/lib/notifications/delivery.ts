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
    // eslint-disable-next-line security/detect-object-injection -- varName extracted from template pattern, not user input
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
  await deliverEmail(email, subject, bodyHtml, bodyText)
}

// Send one email via the admin-configured transport (SMTP or Resend), falling
// back to the RESEND_API_KEY env var if no active transport is configured, and
// to log-only if nothing is set.
async function deliverEmail(
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText: string,
): Promise<void> {
  const { getEmailTransportForSending } = await import("../data/email-transport")
  const transport = await getEmailTransportForSending()

  const fromAddress = transport?.fromAddress || `notifications@${env.RESEND_DOMAIN ?? "crm.nodwin.com"}`
  const fromName = transport?.fromName || "Nodwin CRM"
  const from = `${fromName} <${fromAddress}>`

  const provider = transport?.active ? transport.provider : "resend"

  if (provider === "smtp" && transport?.smtpHost) {
    const nodemailer = await import("nodemailer")
    const smtp = nodemailer.createTransport({
      host: transport.smtpHost,
      port: transport.smtpPort ?? 587,
      secure: transport.smtpSecure,
      auth: transport.smtpUsername
        ? { user: transport.smtpUsername, pass: transport.smtpPassword ?? "" }
        : undefined,
    })
    await smtp.sendMail({ from, to, subject, html: bodyHtml, text: bodyText })
    return
  }

  const apiKey = transport?.resendApiKey || env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(
      "[notifications] no email transport configured (no SMTP host, no Resend key); email is log-only",
    )
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html: bodyHtml, text: bodyText }),
  })
  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to send email via Resend: ${response.status} ${errorBody}`)
  }
}

// Send a test email to verify the configured transport (admin "send test" button).
export async function sendTestEmail(toEmail: string): Promise<void> {
  await deliverEmail(
    toEmail,
    "Nodwin CRM — test email",
    "<p>This is a test email from Nodwin CRM. Your email transport is working. ✅</p>",
    "This is a test email from Nodwin CRM. Your email transport is working.",
  )
}

// Post a single message to a Slack incoming webhook. Never throws — a Slack
// failure must not break notification delivery (it is best-effort). Returns
// whether the post succeeded (used by the admin "send test" action).
export async function postToSlackWebhook(
  url: string,
  text: string,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      console.warn(`[notifications] Slack webhook post failed: ${response.status}`)
      return false
    }
    return true
  } catch (err) {
    console.warn(
      `[notifications] Slack webhook error: ${err instanceof Error ? err.message : String(err)}`,
    )
    return false
  }
}

// Broadcast a message to every connected Slack incoming webhook — per-workspace
// channel posts (ORR-771). No per-user OAuth: the webhook URL is the credential.
// No-ops when nothing is connected, so routing events to Slack before an admin
// has set up a webhook is harmless.
export async function sendSlackNotification(message: string): Promise<void> {
  const client = createServiceRoleClient()

  const { data, error } = await client
    .from("slack_connections")
    .select("webhook_url")
    .eq("status", "connected")
    .not("webhook_url", "is", null)

  if (error) {
    throw new Error(`Failed to load Slack connections: ${error.message}`)
  }

  const urls = ((data ?? []) as { webhook_url: string | null }[])
    .map((r) => r.webhook_url)
    .filter((u): u is string => !!u)

  await Promise.all(urls.map((url) => postToSlackWebhook(url, message)))
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
