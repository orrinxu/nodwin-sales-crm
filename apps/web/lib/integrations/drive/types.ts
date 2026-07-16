// ORR-620: Google Drive byte-fetch seam.
//
// The ingestion worker depends ONLY on this interface, so the concrete
// service-account / googleapis implementation can be dropped in later without
// touching the pipeline. Bytes are fetched transiently and discarded after
// extraction — nothing about the file is persisted except the index.

export interface DriveFile {
  /** Raw file bytes, fetched transiently. */
  bytes: Uint8Array
  /** MIME type as reported by Drive (may differ from documents.mime_type). */
  mimeType: string
  /** File name, for logging / diagnostics. */
  name: string
}

export interface DriveClient {
  /**
   * Fetch a file's bytes by Drive file id. For Google-native types
   * (Docs/Slides/Sheets) the implementation is expected to export to a text
   * MIME type; for binary uploads it downloads the raw bytes.
   */
  fetchFile(driveFileId: string): Promise<DriveFile>
}

// ORR-698: server-side folder auto-create + permission sync.

export interface DriveFolder {
  id: string
  name: string
  webViewLink?: string
}

export interface DriveAdminClient {
  /**
   * Return the folder named `name` under `parentId`, creating it if absent
   * (idempotent — safe to call on every sync).
   */
  ensureFolder(input: { name: string; parentId: string }): Promise<DriveFolder>
  /**
   * Reconcile a folder's user permissions to exactly `emails` (as readers):
   * grant any missing, revoke any extra user grants. The owner/service account
   * is never revoked.
   */
  syncPermissions(fileId: string, emails: string[]): Promise<void>
}
