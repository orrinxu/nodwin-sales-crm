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

  if (opp.drive_folder_id !== folder.id) {
    const { error: updErr } = await db
      .from("opportunities")
      .update({ drive_folder_id: folder.id } as never)
      .eq("id", opp.id)
    if (updErr) throw new Error(`Failed to persist drive_folder_id: ${updErr.message}`)
  }

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

  await client.syncPermissions(folder.id, emails)

  return {
    opportunityId,
    status: "synced",
    folderId: folder.id,
    grantedCount: emails.length,
  }
}

/**
 * Sync the next `limit` opportunities that don't yet have a Drive folder. Errors
 * on one opportunity don't abort the batch — they're reported per-record.
 */
export async function syncPendingOpportunityFolders(
  db: ServerDbClient,
  client: DriveAdminClient,
  limit = 25,
): Promise<OpportunitySyncResult[]> {
  const { data, error } = await db
    .from("opportunities")
    .select("id")
    .is("drive_folder_id", null)
    .limit(limit)
  if (error) throw new Error(`Failed to list opportunities: ${error.message}`)

  const results: OpportunitySyncResult[] = []
  for (const row of (data ?? []) as { id: string }[]) {
    try {
      results.push(await syncOpportunityDriveFolder(db, client, row.id))
    } catch (err) {
      results.push({
        opportunityId: row.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}
