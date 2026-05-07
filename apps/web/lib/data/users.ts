import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export const profileUpdateSchema = z.object({
  fullName: z
    .string()
    .max(100, "Name must be 100 characters or fewer")
    .nullable()
    .optional(),
  notificationPreferences: z
    .object({
      emailNotifications: z.boolean().optional(),
      weeklyDigest: z.boolean().optional(),
    })
    .optional(),
})

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

export interface ProfileCallContext {
  user: AuthenticatedUser
  source: 'web' | 'mcp' | 'webhook' | 'system'
}

export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  primaryRole: string
  primaryEntityName: string | null
  managerName: string | null
  crmInboundEmail: string | null
  customData: Record<string, unknown>
  createdAt: string
}

export async function getProfile(ctx: ProfileCallContext): Promise<UserProfile> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      email,
      full_name,
      primary_role,
      primary_entity_id,
      manager_user_id,
      crm_inbound_email,
      custom_data,
      created_at,
      entities:primary_entity_id ( name ),
      manager:manager_user_id ( full_name )
    `)
    .eq("id", ctx.user.id)
    .single()

  if (error || !data) {
    throw new Error("Failed to load profile")
  }

  const entities = (data.entities as unknown as { name: string } | null)
  const manager = (data.manager as unknown as { full_name: string } | null)

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    primaryRole: data.primary_role,
    primaryEntityName: entities?.name ?? null,
    managerName: manager?.full_name ?? null,
    crmInboundEmail: data.crm_inbound_email,
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at,
  }
}

export interface UserOption {
  id: string
  fullName: string | null
}

export async function getUserOptions(ctx: ProfileCallContext): Promise<UserOption[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name")
    .order("full_name", { ascending: true })

  if (error) {
    throw new Error(`Failed to load users: ${error.message}`)
  }

  return (data ?? []).map((u) => ({
    id: u.id,
    fullName: u.full_name,
  }))
}

export async function updateProfile(
  ctx: ProfileCallContext,
  input: ProfileUpdateInput,
): Promise<UserProfile> {
  const supabase = await createServerClient()

  const updateData: Record<string, unknown> = {}

  if (input.fullName !== undefined) {
    updateData.full_name = input.fullName
  }

  if (input.notificationPreferences !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from("users")
      .select("custom_data")
      .eq("id", ctx.user.id)
      .single()

    if (fetchError) {
      throw new Error("Failed to fetch current custom data")
    }

    const currentCustomData = (current?.custom_data ?? {}) as Record<string, unknown>
    updateData.custom_data = {
      ...currentCustomData,
      notification_preferences: input.notificationPreferences,
    }
  }

  if (Object.keys(updateData).length === 0) {
    return getProfile(ctx)
  }

  const { error: updateError } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", ctx.user.id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  return getProfile(ctx)
}
