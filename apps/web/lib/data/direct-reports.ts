import "server-only"
import { createServerClient } from "@/lib/supabase/server"

// Direct-reports self-service roster data layer (ORR-715). The DB is the authority
// for mutations (can_manage_direct_report + the relaxed guard); these helpers just
// read the roster/candidates (RLS already scopes users to the caller's entity) and
// call the two SECURITY DEFINER RPCs.

const MANAGER_ROLES = ["sales_manager", "regional_head", "group_sales_lead"]

export interface RosterPerson {
  id: string
  name: string
  email: string
}

export interface ManagerRoster {
  isManager: boolean
  directReports: RosterPerson[]
  manageableReps: RosterPerson[]
}

interface DirectReportsContext {
  user: { id: string }
}

function toPerson(u: Record<string, unknown>): RosterPerson {
  return {
    id: u.id as string,
    name: (u.full_name as string) ?? (u.email as string),
    email: u.email as string,
  }
}

/**
 * Load the caller's roster: their current direct reports, plus the sales_reps they
 * are allowed to claim (same entity, and same business unit if the manager has one,
 * not already reporting to them). Non-managers get `isManager: false` and empty lists.
 */
export async function getManagerRoster(ctx: DirectReportsContext): Promise<ManagerRoster> {
  const supabase = await createServerClient()

  const { data: self } = await supabase
    .from("users")
    .select("primary_role, primary_entity_id, primary_business_unit_id")
    .eq("id", ctx.user.id)
    .single()

  const isManager = !!self && MANAGER_ROLES.includes(self.primary_role as string)
  if (!isManager || !self?.primary_entity_id) {
    return { isManager: false, directReports: [], manageableReps: [] }
  }

  const [{ data: reports }, { data: candidates }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email")
      .eq("manager_user_id", ctx.user.id)
      .order("full_name"),
    supabase
      .from("users")
      .select("id, full_name, email, primary_business_unit_id, manager_user_id")
      .eq("primary_role", "sales_rep")
      .eq("primary_entity_id", self.primary_entity_id as string)
      .order("full_name"),
  ])

  const myBu = self.primary_business_unit_id as string | null
  const manageableReps = ((candidates ?? []) as Record<string, unknown>[])
    .filter((u) => u.manager_user_id !== ctx.user.id)
    .filter((u) => myBu == null || u.primary_business_unit_id === myBu)
    .map(toPerson)

  return {
    isManager: true,
    directReports: ((reports ?? []) as Record<string, unknown>[]).map(toPerson),
    manageableReps,
  }
}

export interface AssignResult {
  reportName: string | null
  losingManagerId: string | null
}

export async function assignDirectReport(reportId: string): Promise<AssignResult> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("assign_direct_report", { _report_id: reportId })
  if (error) throw new Error(error.message)
  const r = data as { report_name: string | null; losing_manager_id: string | null }
  return { reportName: r.report_name, losingManagerId: r.losing_manager_id }
}

export async function removeDirectReport(reportId: string): Promise<{ reportName: string | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("remove_direct_report", { _report_id: reportId })
  if (error) throw new Error(error.message)
  const r = data as { report_name: string | null }
  return { reportName: r.report_name }
}

/** Resolve a user's display name (for notification copy). */
export async function getUserDisplayName(userId: string): Promise<string> {
  const supabase = await createServerClient()
  const { data } = await supabase.from("users").select("full_name, email").eq("id", userId).single()
  return (data?.full_name as string) ?? (data?.email as string) ?? "A manager"
}
