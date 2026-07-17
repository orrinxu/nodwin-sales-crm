"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getSlackConnections,
  getSlackWebhookUrl,
  upsertSlackConnection,
  deleteSlackConnection,
  getSlackEventRouting,
  setSlackEventRouting,
  type SlackConnection,
  type SlackConnectionInput,
  type SlackEventRoutingInput,
  type SlackRoutableEvent,
} from "@/lib/data/slack"
import { postToSlackWebhook } from "@/lib/notifications/delivery"

export async function getSlackAdminAction(): Promise<{
  connections: SlackConnection[]
  eventRouting: Record<SlackRoutableEvent, boolean>
}> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const [connections, eventRouting] = await Promise.all([
    getSlackConnections(ctx),
    getSlackEventRouting(ctx),
  ])
  return { connections, eventRouting }
}

export async function saveSlackConnectionAction(input: unknown): Promise<void> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await upsertSlackConnection(ctx, input as SlackConnectionInput)
  revalidatePath("/admin/slack")
}

export async function deleteSlackConnectionAction(id: string): Promise<void> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deleteSlackConnection(ctx, id)
  revalidatePath("/admin/slack")
}

export async function setSlackEventRoutingAction(input: unknown): Promise<void> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await setSlackEventRouting(ctx, input as SlackEventRoutingInput)
  revalidatePath("/admin/slack")
}

// Post a test message to a connection's webhook to confirm it's wired up.
export async function sendTestSlackAction(
  connectionId: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const url = await getSlackWebhookUrl(ctx, connectionId)
  if (!url) return { ok: false }
  const ok = await postToSlackWebhook(
    url,
    "*Nodwin CRM* — Slack is connected. Deal notifications will post here. ✅",
  )
  return { ok }
}
