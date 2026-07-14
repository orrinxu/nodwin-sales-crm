import type { DashboardContext } from "@/lib/data/metrics"

// ORR-723 — the dashboard "Group" tab is a management-tier rollup, gated by the
// caller's primary_role. exec / group_sales_lead see a group-wide rollup;
// regional_head sees their region; everyone else has no Group tab. The gate is a
// pure function of ctx.user.role (already the primary_role, set by requireUser via
// current_user_role) — the actual region/group narrowing happens in-database in
// region_entity_ids(auth.uid()), so this is only the render gate, never a trusted
// query input.

const GROUP_WIDE_ROLES = new Set(["exec", "group_sales_lead"])

export type GroupTier = "group" | "region"

export interface GroupScope {
  /** Whether the caller's role gets a populated Group tab at all. */
  canViewGroup: boolean
  /** "group" = whole group (exec/group_sales_lead); "region" = own region (regional_head). */
  tier: GroupTier | null
}

export function getGroupScope(ctx: DashboardContext): GroupScope {
  const role = ctx.user.role
  if (role && GROUP_WIDE_ROLES.has(role)) return { canViewGroup: true, tier: "group" }
  if (role === "regional_head") return { canViewGroup: true, tier: "region" }
  return { canViewGroup: false, tier: null }
}
