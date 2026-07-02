import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface ActivityCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export const ACTIVITY_TYPES = [
  "note",
  "call",
  "email_inbound",
  "email_outbound",
  "meeting",
  "task",
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export interface ActivityRecord {
  id: string
  opportunityId: string | null
  opportunityName: string | null
  accountId: string | null
  accountName: string | null
  contactId: string | null
  contactName: string | null
  userId: string
  userName: string | null
  type: ActivityType
  externalThreadId: string | null
  subject: string | null
  body: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export const activityCreateSchema = z.object({
  opportunityId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  type: z.enum(ACTIVITY_TYPES),
  subject: z.string().max(300).nullable().optional().or(z.literal("")),
  body: z.string().max(10000).nullable().optional().or(z.literal("")),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>

const ACTIVITY_SELECT = `
  id,
  account_id,
  opportunity_id,
  contact_id,
  user_id,
  type,
  external_thread_id,
  subject,
  body,
  metadata,
  created_at,
  updated_at,
  author:user_id ( full_name ),
  opportunity:opportunity_id ( name ),
  account:account_id ( name ),
  contact:contact_id ( full_name )
`

function toDomainActivity(data: Record<string, unknown>): ActivityRecord {
  const author = data.author as { full_name: string } | null
  const opportunity = data.opportunity as { name: string } | null
  const account = data.account as { name: string } | null
  const contact = data.contact as { full_name: string } | null
  return {
    id: data.id as string,
    opportunityId: (data.opportunity_id as string) ?? null,
    opportunityName: opportunity?.name ?? null,
    accountId: (data.account_id as string) ?? null,
    accountName: account?.name ?? null,
    contactId: (data.contact_id as string) ?? null,
    contactName: contact?.full_name ?? null,
    userId: data.user_id as string,
    userName: author?.full_name ?? null,
    type: data.type as ActivityType,
    externalThreadId: (data.external_thread_id as string) ?? null,
    subject: (data.subject as string) ?? null,
    body: (data.body as string) ?? null,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getActivities(
  ctx: ActivityCallContext,
  options?: { type?: ActivityType; limit?: number },
): Promise<ActivityRecord[]> {
  const supabase = await createServerClient()

  let query = supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50)

  if (options?.type) {
    query = query.eq("type", options.type)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to load activities: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainActivity(r as Record<string, unknown>))
}

export async function getActivitiesForOpportunity(
  ctx: ActivityCallContext,
  opportunityId: string,
): Promise<ActivityRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load activities: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainActivity(r as Record<string, unknown>))
}

export async function getActivitiesForAccount(
  ctx: ActivityCallContext,
  accountId: string,
): Promise<ActivityRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load activities: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainActivity(r as Record<string, unknown>))
}

export async function getActivitiesForContact(
  ctx: ActivityCallContext,
  contactId: string,
): Promise<ActivityRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load activities: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainActivity(r as Record<string, unknown>))
}

export async function createActivity(
  ctx: ActivityCallContext,
  input: ActivityCreateInput,
): Promise<ActivityRecord> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("activities")
    .insert({
      opportunity_id: input.opportunityId ?? null,
      account_id: input.accountId ?? null,
      contact_id: input.contactId ?? null,
      user_id: ctx.user.id,
      type: input.type,
      subject: input.subject || null,
      body: input.body || null,
      metadata: {
        ...(input.metadata ?? {}),
        source: ctx.source,
      },
    })
    .select(ACTIVITY_SELECT)
    .single()

  if (error) {
    throw new Error(`Failed to create activity: ${error.message}`)
  }

  return toDomainActivity(data as Record<string, unknown>)
}
