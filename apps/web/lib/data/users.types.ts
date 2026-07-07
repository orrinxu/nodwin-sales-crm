import { z } from "zod"

export const USER_ROLES = [
  "sales_rep",
  "sales_manager",
  "regional_head",
  "group_sales_lead",
  "finance",
  "ops",
  "entity_admin",
  "admin",
  "exec",
  "external_partner",
] as const
export type UserRole = (typeof USER_ROLES)[number]

export interface AdminUserRecord {
  id: string
  email: string | null
  fullName: string | null
  /** The user's primary_role (base enum) — kept for display/back-compat. */
  role: UserRole
  /** The assigned role's id (roles table), if set. */
  roleId: string | null
  /** The assigned role's label (custom or system), for display. */
  roleLabel: string | null
  active: boolean
  crmInboundEmail: string | null
  primaryEntityId: string | null
  primaryEntityName: string | null
  primaryBusinessUnitId: string | null
  primaryBusinessUnitName: string | null
  managerUserId: string | null
  managerName: string | null
}

export const userAdminUpdateSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(200).optional(),
  // Assign a role from the roles table (system or custom). Setting role_id syncs
  // primary_role from the role's base_role via a DB trigger.
  roleId: z.string().uuid().optional(),
  // Legacy: assign the primary_role enum directly (non-UI callers).
  role: z.enum(USER_ROLES).optional(),
  primaryEntityId: z.string().uuid().nullable().optional(),
  primaryBusinessUnitId: z.string().uuid().nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
})

export type UserAdminUpdateInput = z.input<typeof userAdminUpdateSchema>
