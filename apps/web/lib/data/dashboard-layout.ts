import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

/**
 * Per-user dashboard widget layout. Persisted as a jsonb column on
 * user_preferences (owner-only, same RLS as every other preference). A layout is
 * an ordered list of { id, colSpan, rowSpan } on a 12-column grid; NULL/absent
 * means "use the default layout".
 */

export interface DashboardLayoutCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface DashboardWidgetLayout {
  id: string
  colSpan: number
  rowSpan: number
}
export type DashboardLayout = DashboardWidgetLayout[]

export const dashboardLayoutSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      colSpan: z.number().int().min(1).max(12),
      rowSpan: z.number().int().min(1).max(12),
    }),
  )
  .max(50)

/** The caller's saved layout, or null when they have never customized it. An
 *  unexpected stored shape degrades to null (→ default) rather than throwing. */
export async function getDashboardLayout(
  ctx: DashboardLayoutCallContext,
): Promise<DashboardLayout | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("user_preferences")
    .select("dashboard_layout")
    .eq("user_id", ctx.user.id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load dashboard layout: ${error.message}`)
  if (!data?.dashboard_layout) return null

  const parsed = dashboardLayoutSchema.safeParse(data.dashboard_layout)
  return parsed.success ? parsed.data : null
}

/** Persist the caller's layout. Upserts the user_preferences row, touching only
 *  dashboard_layout so other preferences are preserved. user_id is forced from
 *  the context; RLS enforces the same. */
export async function saveDashboardLayout(
  ctx: DashboardLayoutCallContext,
  layout: DashboardLayout,
): Promise<void> {
  const parsed = dashboardLayoutSchema.parse(layout)
  const supabase = await createServerClient()
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: ctx.user.id,
      updated_by: ctx.user.id,
      dashboard_layout: parsed,
    },
    { onConflict: "user_id" },
  )
  if (error) throw new Error(`Failed to save dashboard layout: ${error.message}`)
}

/** Clear the caller's saved layout so the dashboard falls back to the default. */
export async function resetDashboardLayout(
  ctx: DashboardLayoutCallContext,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("user_preferences")
    .update({ dashboard_layout: null, updated_by: ctx.user.id })
    .eq("user_id", ctx.user.id)
  if (error) throw new Error(`Failed to reset dashboard layout: ${error.message}`)
}
