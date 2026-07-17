import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface SlackCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type SlackConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

// Safe view for the admin UI — the webhook URL is a secret and is NEVER included;
// only whether one is set. slack_connections SELECT is admin-only RLS, but we
// still strip the secret so it can't reach the client component.
export interface SlackConnection {
  id: string
  workspaceName: string | null
  channelLabel: string | null
  status: SlackConnectionStatus
  hasWebhookUrl: boolean
  createdAt: string
}

function mapSafe(r: Record<string, unknown>): SlackConnection {
  return {
    id: r.id as string,
    workspaceName: (r.workspace_name as string) ?? null,
    channelLabel: (r.channel_label as string) ?? null,
    status: ((r.status as string) ?? "disconnected") as SlackConnectionStatus,
    hasWebhookUrl: !!r.webhook_url,
    createdAt: r.created_at as string,
  }
}

// Safe list for the admin UI — secret stripped. RLS restricts read to admins.
export async function getSlackConnections(
  ctx: SlackCallContext,
): Promise<SlackConnection[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("slack_connections")
    .select("id, workspace_name, channel_label, status, webhook_url, created_at")
    .order("created_at", { ascending: true })
  if (error) throw new Error(`Failed to load Slack connections: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(mapSafe)
}

// The webhook URL secret for a single connection — server-side only (e.g. the
// "send test" action). RLS restricts read to admins; never return this to a
// client component.
export async function getSlackWebhookUrl(
  ctx: SlackCallContext,
  id: string,
): Promise<string | null> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("slack_connections")
    .select("webhook_url")
    .eq("id", z.string().uuid().parse(id))
    .maybeSingle()
  if (error) throw new Error(`Failed to load Slack webhook: ${error.message}`)
  return (data?.webhook_url as string | null) ?? null
}

// Slack incoming-webhook URLs are always under hooks.slack.com/services/…
const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/"

export const slackConnectionSchema = z.object({
  id: z.string().uuid().optional(), // present = update an existing connection
  workspaceName: z.string().min(1, "Give this connection a name").max(200),
  channelLabel: z.string().max(120).nullable().optional().or(z.literal("")),
  // Write-only secret: blank/omitted on an update keeps the stored URL.
  webhookUrl: z
    .string()
    .max(500)
    .refine((u) => u === "" || u.startsWith(SLACK_WEBHOOK_PREFIX), {
      message: "Must be a Slack incoming-webhook URL (https://hooks.slack.com/…)",
    })
    .optional(),
})
export type SlackConnectionInput = z.input<typeof slackConnectionSchema>

// Admin upsert. Saving marks the connection 'connected'. The webhook URL is
// write-only — a blank value on an update leaves the stored secret untouched.
export async function upsertSlackConnection(
  ctx: SlackCallContext,
  input: SlackConnectionInput,
): Promise<void> {
  void ctx
  const parsed = slackConnectionSchema.parse(input)
  const supabase = await createServerClient()

  const patch: Record<string, unknown> = {
    workspace_name: parsed.workspaceName,
    channel_label: parsed.channelLabel || null,
    status: "connected",
  }
  if (parsed.webhookUrl && parsed.webhookUrl.length > 0) {
    patch.webhook_url = parsed.webhookUrl
  }

  if (parsed.id) {
    const { error } = await supabase
      .from("slack_connections")
      .update(patch as never)
      .eq("id", parsed.id)
    if (error) throw new Error(`Failed to save Slack connection: ${error.message}`)
  } else {
    if (!parsed.webhookUrl) {
      throw new Error("A Slack incoming-webhook URL is required for a new connection.")
    }
    // workspace_id is NOT NULL + UNIQUE; the incoming-webhook model has no natural
    // workspace id, so mint a stable handle per connection.
    patch.workspace_id = crypto.randomUUID()
    const { error } = await supabase.from("slack_connections").insert(patch as never)
    if (error) throw new Error(`Failed to save Slack connection: ${error.message}`)
  }
}

export async function deleteSlackConnection(
  ctx: SlackCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("slack_connections")
    .delete()
    .eq("id", z.string().uuid().parse(id))
  if (error) throw new Error(`Failed to delete Slack connection: ${error.message}`)
}

// ── Which events broadcast to Slack (org-wide notification_routing rows) ──────
// Only the events with a single natural recipient are offered — a channel
// broadcast of a per-recipient event would post once per notified user, and
// confidential/break-glass events must never fan out to a shared channel.
export const SLACK_ROUTABLE_EVENTS = [
  { value: "stage_change", label: "Deal stage changed" },
  { value: "deal_won", label: "Deal won" },
  { value: "deal_lost", label: "Deal lost" },
  { value: "deal_assigned", label: "Deal assigned" },
  { value: "approval_requested", label: "Approval requested" },
] as const
export type SlackRoutableEvent = (typeof SLACK_ROUTABLE_EVENTS)[number]["value"]

const SLACK_EVENT_VALUES: readonly string[] = SLACK_ROUTABLE_EVENTS.map((e) => e.value)

export const slackEventRoutingSchema = z.object({
  eventType: z.enum([
    "stage_change",
    "deal_won",
    "deal_lost",
    "deal_assigned",
    "approval_requested",
  ]),
  enabled: z.boolean(),
})
export type SlackEventRoutingInput = z.infer<typeof slackEventRoutingSchema>

// Current org-wide (entity_id NULL) Slack routing state, one flag per routable
// event. Missing rows read as off.
export async function getSlackEventRouting(
  ctx: SlackCallContext,
): Promise<Record<SlackRoutableEvent, boolean>> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("notification_routing")
    .select("event_type, enabled")
    .eq("channel", "slack")
    .is("entity_id", null)
  if (error) throw new Error(`Failed to load Slack routing: ${error.message}`)

  const state = new Map<string, boolean>(SLACK_EVENT_VALUES.map((e) => [e, false]))
  for (const r of (data ?? []) as { event_type: string; enabled: boolean }[]) {
    if (state.has(r.event_type)) state.set(r.event_type, !!r.enabled)
  }
  return Object.fromEntries(state) as Record<SlackRoutableEvent, boolean>
}

// Enable/disable one event's org-wide Slack route. NULL entity_id defeats
// ON CONFLICT (NULLs compare distinct), so upsert by natural key by hand.
export async function setSlackEventRouting(
  ctx: SlackCallContext,
  input: SlackEventRoutingInput,
): Promise<void> {
  const parsed = slackEventRoutingSchema.parse(input)
  const supabase = await createServerClient()

  const { data: existing, error: selErr } = await supabase
    .from("notification_routing")
    .select("id")
    .eq("event_type", parsed.eventType)
    .eq("channel", "slack")
    .is("entity_id", null)
    .maybeSingle()
  if (selErr) throw new Error(`Failed to read Slack routing: ${selErr.message}`)

  if (existing) {
    const { error } = await supabase
      .from("notification_routing")
      .update({ enabled: parsed.enabled, updated_by: ctx.user.id } as never)
      .eq("id", (existing as { id: string }).id)
    if (error) throw new Error(`Failed to update Slack routing: ${error.message}`)
  } else {
    const { error } = await supabase
      .from("notification_routing")
      .insert({
        event_type: parsed.eventType,
        channel: "slack",
        enabled: parsed.enabled,
        entity_id: null,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
      } as never)
    if (error) throw new Error(`Failed to insert Slack routing: ${error.message}`)
  }
}
