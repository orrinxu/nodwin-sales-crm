import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { DashboardContext } from "@/lib/data/metrics"

export interface TeamScope {
  /** The caller's reporting subtree: their own id + all recursive direct reports. */
  memberIds: string[]
  /** True when the subtree contains anyone besides the caller (i.e. they manage a team). */
  hasReports: boolean
}

/**
 * Resolve the caller's reporting subtree (ORR-722) via the `team_member_ids`
 * RPC, which walks `users.manager_user_id` from the caller down. Used by the
 * dashboard "Team" tab to decide whether to show the team leaderboard/funnel or
 * a "you don't manage a team yet" empty state.
 *
 * The team-scoped aggregates re-resolve the same subtree in-database from
 * auth.uid(), so this call is only for the has-reports gate — never a trusted
 * input to a query.
 */
export async function getTeamScope(ctx: DashboardContext): Promise<TeamScope> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("team_member_ids", {
    _root: ctx.user.id,
  })
  if (error) {
    throw new Error(`Failed to resolve team scope: ${error.message}`)
  }
  const memberIds = (data ?? []) as string[]
  return {
    memberIds,
    hasReports: memberIds.some((id) => id !== ctx.user.id),
  }
}
