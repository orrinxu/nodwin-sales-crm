import "server-only"
import type { ServerDbClient } from "@/lib/supabase/server"

/**
 * Read accessor for `drive_config` (ORR-698). The parent-folder ids are set by an
 * admin out-of-band; the Drive sync reads them to know where to create per-record
 * folders. Config is keyed by entity, so each selling entity can point at its own
 * Drive folder tree. The Supabase client is injected so callers control the auth
 * context (an admin session, or the service role for the background drain).
 */
export interface DriveConfigFolders {
  accountsParentFolderId: string | null
  opportunitiesParentFolderId: string | null
  pnlParentFolderId: string | null
}

export async function getDriveConfigForEntity(
  db: ServerDbClient,
  entityId: string,
): Promise<DriveConfigFolders | null> {
  const { data, error } = await db
    .from("drive_config")
    .select("accounts_parent_folder_id, opportunities_parent_folder_id, pnl_parent_folder_id")
    .eq("entity_id", entityId)
    .maybeSingle()

  if (error) throw new Error(`Failed to read drive_config: ${error.message}`)
  if (!data) return null

  return {
    accountsParentFolderId: data.accounts_parent_folder_id ?? null,
    opportunitiesParentFolderId: data.opportunities_parent_folder_id ?? null,
    pnlParentFolderId: data.pnl_parent_folder_id ?? null,
  }
}
