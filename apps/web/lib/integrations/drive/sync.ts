import "server-only"
import type { ServerDbClient } from "@/lib/supabase/server"
import { getDriveConfigForEntity } from "@/lib/data/drive-config"
import type { DriveAdminClient } from "./types"

/**
 * Drive folder + permission sync for opportunities (ORR-698).
 *
 * For each opportunity: ensure a folder exists under the selling entity's
 * configured parent folder, persist its id, then reconcile the folder's Google
 * permissions to exactly the users who can see the opportunity (from
 * `opportunity_visibility`, which already encodes the visibility-tier rules).
 * Both the DB client and the DriveAdminClient are injected so this is
 * unit-testable with fakes and the background drain can run under the service
 * role (which sees every opportunity).
 */

export interface OpportunitySyncResult {
  opportunityId: string
  status: "synced" | "skipped" | "failed"
  folderId?: string
  grantedCount?: number
  reason?: string
}

/** Stable, collision-free folder name (opp names aren't unique). */
function folderName(name: string, id: string): string {
  return `${name} — ${id.slice(0, 8)}`
}

export async function syncOpportunityDriveFolder(
  db: ServerDbClient,
  client: DriveAdminClient,
  opportunityId: string,
): Promise<OpportunitySyncResult> {
  const { data: opp, error: oppErr } = await db
    .from("opportunities")
    .select("id, name, entity_sales_id, drive_folder_id")
    .eq("id", opportunityId)
    .maybeSingle()
  if (oppErr) throw new Error(`Failed to read opportunity: ${oppErr.message}`)
  if (!opp) return { opportunityId, status: "skipped", reason: "opportunity not found" }

  if (!opp.entity_sales_id) {
    return { opportunityId, status: "skipped", reason: "no selling entity set" }
  }

  const config = await getDriveConfigForEntity(db, opp.entity_sales_id)
  const parentId = config?.opportunitiesParentFolderId
  if (!parentId) {
    return {
      opportunityId,
      status: "skipped",
      reason: "no opportunities_parent_folder_id configured for the selling entity",
    }
  }

  const folder = await client.ensureFolder({
    name: folderName(opp.name, opp.id),
    parentId,
  })

  // Who may see this opportunity → their Google (Workspace) emails.
  const { data: vis, error: visErr } = await db
    .from("opportunity_visibility")
    .select("user_id")
    .eq("opportunity_id", opp.id)
  if (visErr) throw new Error(`Failed to read opportunity_visibility: ${visErr.message}`)

  const userIds = [...new Set((vis ?? []).map((v) => v.user_id as string))]
  let emails: string[] = []
  if (userIds.length > 0) {
    const { data: users, error: usersErr } = await db
      .from("users")
      .select("email")
      .in("id", userIds)
    if (usersErr) throw new Error(`Failed to read user emails: ${usersErr.message}`)
    emails = (users ?? []).map((u) => u.email as string).filter(Boolean)
  }

  // Reconcile Drive permissions to exactly the visibility set (revokes stale
  // grants, adds new collaborators). This is the security-critical step (b): it
  // must re-run whenever the visibility set changes, not just at folder creation.
  await client.syncPermissions(folder.id, emails)

  // Persist folder id + mark synced. Unconditional so a re-reconcile of a `stale`
  // row (folder unchanged) still clears the stale flag back to `synced`.
  const { error: updErr } = await db
    .from("opportunities")
    .update({
      drive_folder_id: folder.id,
      drive_sync_status: "synced",
      drive_sync_next_attempt_at: null,
    } as never)
    .eq("id", opp.id)
  if (updErr) throw new Error(`Failed to persist drive sync state: ${updErr.message}`)

  return {
    opportunityId,
    status: "synced",
    folderId: folder.id,
    grantedCount: emails.length,
  }
}

/** Backoff before a transiently-failed row re-enters the drain hot path. */
const FAILURE_BACKOFF_MS = 15 * 60 * 1000

/** Write a drain outcome marker so a row's next-attempt behaviour is deterministic. */
async function markSyncOutcome(
  db: ServerDbClient,
  opportunityId: string,
  patch: { drive_sync_status: string; drive_sync_next_attempt_at: string | null },
): Promise<void> {
  await db
    .from("opportunities")
    .update(patch as never)
    .eq("id", opportunityId)
}

/**
 * (a) Sync the next `limit` opportunities that don't yet have a Drive folder.
 *
 * Deterministic `ORDER BY created_at, id` + a skip-marker keep the queue honest:
 * a row that `skipped` (no selling entity / no parent-folder config) is marked
 * `drive_sync_status = 'skipped'` and leaves the hot path — it only re-enters
 * when the relevant config changes (DB triggers reset the marker). A transient
 * failure is marked `failed` with a `next_attempt_at` backoff. Without this, a
 * handful of permanently-skipped rows re-occupied every batch and starved
 * newly-created, fully-configured deals. Errors on one row don't abort the batch.
 */
export async function syncPendingOpportunityFolders(
  db: ServerDbClient,
  client: DriveAdminClient,
  limit = 25,
): Promise<OpportunitySyncResult[]> {
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from("opportunities")
    .select("id")
    .is("drive_folder_id", null)
    // Skip-marker: exclude permanently-skipped rows (NULL status is eligible).
    .or("drive_sync_status.is.null,drive_sync_status.neq.skipped")
    // Backoff: exclude rows whose retry time is still in the future.
    .or(`drive_sync_next_attempt_at.is.null,drive_sync_next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Failed to list opportunities: ${error.message}`)

  const results: OpportunitySyncResult[] = []
  for (const row of (data ?? []) as { id: string }[]) {
    try {
      const result = await syncOpportunityDriveFolder(db, client, row.id)
      // `synced` already persisted its markers inside the sync. A `skipped` row
      // must be parked so it stops re-occupying the hot path.
      if (result.status === "skipped") {
        await markSyncOutcome(db, row.id, {
          drive_sync_status: "skipped",
          drive_sync_next_attempt_at: null,
        })
      }
      results.push(result)
    } catch (err) {
      await markSyncOutcome(db, row.id, {
        drive_sync_status: "failed",
        drive_sync_next_attempt_at: new Date(Date.now() + FAILURE_BACKOFF_MS).toISOString(),
      })
      results.push({
        opportunityId: row.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}

/**
 * (b) Re-reconcile Drive permissions for opportunities flagged `stale`.
 *
 * A DB trigger marks every folder-having opportunity `stale` when its
 * `opportunity_visibility` set changes (owner / tier / confidentiality / team /
 * region / manager). Re-running `syncOpportunityDriveFolder` re-invokes
 * `client.syncPermissions`, which revokes users who lost access and grants new
 * collaborators. Without this, revoked users kept Drive reader access to the
 * folder and its documents indefinitely (the security bug). A successful sync
 * clears the row back to `synced`; a transient failure gets a backoff so it
 * doesn't hot-loop but is retried.
 */
export async function reconcileStaleOpportunityPermissions(
  db: ServerDbClient,
  client: DriveAdminClient,
  limit = 25,
): Promise<OpportunitySyncResult[]> {
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from("opportunities")
    .select("id")
    .eq("drive_sync_status", "stale")
    .or(`drive_sync_next_attempt_at.is.null,drive_sync_next_attempt_at.lte.${nowIso}`)
    .order("drive_sync_next_attempt_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Failed to list stale opportunities: ${error.message}`)

  const results: OpportunitySyncResult[] = []
  for (const row of (data ?? []) as { id: string }[]) {
    try {
      const result = await syncOpportunityDriveFolder(db, client, row.id)
      // A stale row losing its config (skipped before reaching syncPermissions)
      // must not hot-loop — back it off. `synced` already cleared the flag.
      if (result.status === "skipped") {
        await markSyncOutcome(db, row.id, {
          drive_sync_status: "stale",
          drive_sync_next_attempt_at: new Date(Date.now() + FAILURE_BACKOFF_MS).toISOString(),
        })
      }
      results.push(result)
    } catch (err) {
      await markSyncOutcome(db, row.id, {
        drive_sync_status: "stale",
        drive_sync_next_attempt_at: new Date(Date.now() + FAILURE_BACKOFF_MS).toISOString(),
      })
      results.push({
        opportunityId: row.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}
