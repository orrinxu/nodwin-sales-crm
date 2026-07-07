/**
 * Canonical permission catalogue. This is the single source of truth mirrored by
 * the DB `permissions` table seed (migration 20260707030000_roles_permissions.sql)
 * — a Vitest drift test keeps the two in step. Permissions are code-defined:
 * admins TOGGLE them per role in the roles matrix, they never invent new keys.
 *
 * Client-safe (no "use client", no server-only) so both the admin UI and the
 * server layers can import it.
 */

export interface PermissionSpec {
  /** `category.action`, e.g. "opportunities.delete". */
  key: string
  category: string
  label: string
  description: string
}

export const PERMISSIONS = [
  { key: "opportunities.view_all", category: "Opportunities", label: "View all deals", description: "See all group opportunities, not just own/team" },
  { key: "opportunities.edit", category: "Opportunities", label: "Edit deals", description: "Create and edit opportunities" },
  { key: "opportunities.delete", category: "Opportunities", label: "Delete deals", description: "Delete opportunities (incl. bulk)" },
  { key: "opportunities.reassign", category: "Opportunities", label: "Reassign / split", description: "Change owner, splits, and team members" },
  { key: "opportunities.export", category: "Opportunities", label: "Export deals", description: "Export opportunity data" },
  { key: "approvals.submit", category: "Approvals", label: "Submit for approval", description: "Submit an opportunity for approval" },
  { key: "approvals.approve", category: "Approvals", label: "Approve / reject", description: "Record an approval decision" },
  { key: "approvals.reassign", category: "Approvals", label: "Reassign / cancel", description: "Reassign approval steps or cancel an instance" },
  { key: "accounts.manage", category: "Accounts", label: "Manage accounts", description: "Create and edit accounts and contacts" },
  { key: "accounts.export", category: "Accounts", label: "Export accounts", description: "Export account/contact data" },
  { key: "reports.view", category: "Reports", label: "View reports", description: "Access the reports area" },
  { key: "reports.view_forecast", category: "Reports", label: "View forecast", description: "View forecast and rep scorecards" },
  { key: "knowledge.view", category: "Knowledge", label: "View knowledge base", description: "Access the knowledge base" },
  { key: "ai.use", category: "AI", label: "Use AI features", description: "Use the AI deal copilot" },
  { key: "admin.manage_users", category: "Administration", label: "Manage users", description: "Manage users and role assignment" },
  { key: "admin.manage_roles", category: "Administration", label: "Manage roles", description: "Manage roles and permissions (this area)" },
  { key: "admin.manage_entities", category: "Administration", label: "Manage entities", description: "Manage entities, business units, org settings" },
  { key: "admin.manage_fields", category: "Administration", label: "Manage fields", description: "Manage custom fields and relationship types" },
  { key: "admin.manage_approvals", category: "Administration", label: "Manage approvals", description: "Manage approval workflows" },
  { key: "admin.manage_ai", category: "Administration", label: "Manage AI config", description: "Manage AI providers, settings, deal-health" },
  { key: "admin.manage_email", category: "Administration", label: "Manage email/domains", description: "Manage email transport and allowed domains" },
  { key: "admin.data_management", category: "Administration", label: "Data management", description: "Bulk data operations" },
] as const satisfies readonly PermissionSpec[]

export type PermissionKey = (typeof PERMISSIONS)[number]["key"]

/** Category display order (first appearance in PERMISSIONS). */
export const PERMISSION_CATEGORIES: string[] = [
  ...new Set(PERMISSIONS.map((p) => p.category)),
]

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key)

const KEY_SET = new Set<string>(PERMISSION_KEYS)
export function isPermissionKey(value: string): value is PermissionKey {
  return KEY_SET.has(value)
}
