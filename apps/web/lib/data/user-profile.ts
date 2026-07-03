import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface UserProfileCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface OwnProfileRecord {
  id: string
  email: string | null
  fullName: string | null
  // Read-only, admin-controlled (role is trigger-locked; entity/BU are org-owned).
  role: string | null
  entityName: string | null
  businessUnitName: string | null
  crmInboundEmail: string | null
}

export const ownProfileUpdateSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(200),
})

export type OwnProfileUpdateInput = z.infer<typeof ownProfileUpdateSchema>

// The caller's own profile. `full_name` is user-editable (users_update_own);
// role / entity / business unit are admin-controlled and shown read-only.
export async function getOwnProfile(
  ctx: UserProfileCallContext,
): Promise<OwnProfileRecord> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("users")
    .select(
      "id, email, full_name, primary_role, primary_entity_id, primary_business_unit_id, crm_inbound_email",
    )
    .eq("id", ctx.user.id)
    .single()

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`)
  }

  const row = data as Record<string, unknown>

  // primary_entity_id / primary_business_unit_id have no FK (deferred), so
  // resolve names with targeted reads. RLS may hide these for some roles — a
  // null name degrades gracefully to "—" in the UI.
  let entityName: string | null = null
  let businessUnitName: string | null = null

  if (row.primary_entity_id) {
    const { data: entity } = await supabase
      .from("entities")
      .select("name")
      .eq("id", row.primary_entity_id as string)
      .maybeSingle()
    entityName = (entity?.name as string) ?? null
  }

  if (row.primary_business_unit_id) {
    const { data: bu } = await supabase
      .from("business_units")
      .select("name")
      .eq("id", row.primary_business_unit_id as string)
      .maybeSingle()
    businessUnitName = (bu?.name as string) ?? null
  }

  return {
    id: row.id as string,
    email: (row.email as string) ?? null,
    fullName: (row.full_name as string) ?? null,
    role: (row.primary_role as string) ?? null,
    entityName,
    businessUnitName,
    crmInboundEmail: (row.crm_inbound_email as string) ?? null,
  }
}

// Updates the caller's own editable profile fields. RLS (users_update_own)
// scopes to auth.uid(); the prevent_role_escalation trigger already blocks
// role/manager changes, so only full_name is touched here.
export async function updateOwnProfile(
  ctx: UserProfileCallContext,
  input: OwnProfileUpdateInput,
): Promise<void> {
  const parsed = ownProfileUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("users")
    .update({ full_name: parsed.fullName } as never)
    .eq("id", ctx.user.id)

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`)
  }
}
