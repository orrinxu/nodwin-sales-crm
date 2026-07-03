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
  role: UserRole
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
  role: z.enum(USER_ROLES).optional(),
  primaryEntityId: z.string().uuid().nullable().optional(),
  primaryBusinessUnitId: z.string().uuid().nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
})

export type UserAdminUpdateInput = z.input<typeof userAdminUpdateSchema>
