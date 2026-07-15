import "server-only"
import { createServerClient } from "@/lib/supabase/server"

// Break-glass Confidential self-grant (ORR-716). Thin data-layer wrappers over the
// two SECURITY DEFINER RPCs; all authority (exec-only, Confidential-only, audit)
// lives in the database function, not here.

export interface BreakGlassTarget {
  opportunityName: string
  ownerName: string | null
}

/**
 * Probe whether the current caller could break-glass into a specific deal. The
 * DB function returns a row ONLY for an exec who is not yet entitled to a
 * Confidential deal; for everyone else (and any non-Confidential id) it returns
 * nothing, so this leaks no existence. Used by the deal page to decide whether to
 * offer the break-glass door in place of a 404.
 */
export async function getBreakGlassTarget(
  opportunityId: string,
): Promise<BreakGlassTarget | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("confidential_break_glass_target", {
    _opportunity_id: opportunityId,
  })
  if (error) throw new Error(`getBreakGlassTarget: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : null
  if (!row) return null
  return {
    opportunityName: row.opportunity_name,
    ownerName: row.owner_name ?? null,
  }
}

export interface BreakGlassResult {
  opportunityId: string
  opportunityName: string
  notifyUserIds: string[]
}

/**
 * Perform the break-glass grant. The RPC appends the caller to the deal's
 * confidentiality_override_user_ids (per-deal, never a role), writes the audit
 * row, and returns the named list to notify. Throws the RPC's error on refusal
 * (non-exec, non-Confidential, empty reason, already-entitled).
 */
export async function breakGlassConfidential(
  opportunityId: string,
  reason: string,
): Promise<BreakGlassResult> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("break_glass_confidential", {
    _opportunity_id: opportunityId,
    _reason: reason,
  })
  if (error) throw new Error(error.message)
  const result = data as {
    opportunity_id: string
    opportunity_name: string
    notify_user_ids: string[]
  }
  return {
    opportunityId: result.opportunity_id,
    opportunityName: result.opportunity_name,
    notifyUserIds: result.notify_user_ids ?? [],
  }
}
