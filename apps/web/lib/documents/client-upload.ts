// Client-side upload helper shared by the Files module's drag-drop/picker path
// and the Google Drive import button. Bytes go straight from the browser to a
// short-lived signed Storage URL — they never transit the Next.js server (which
// matters for the hundreds-of-MB proposals this CRM handles). MUST NOT import
// "server-only": this runs in the browser.
import { createClient } from "@/lib/supabase/client"
import {
  createDocumentUploadAction,
  finalizeDocumentUploadAction,
  createDocumentReplacementAction,
  finalizeDocumentReplacementAction,
} from "@/app/(crm)/documents/actions"
import type { DocumentCategory } from "@/lib/data/documents.types"

/** Exactly one of these identifies the parent record. */
export interface UploadTarget {
  opportunityId?: string
  accountId?: string
}

export interface UploadMeta {
  name: string
  mimeType: string
  category?: DocumentCategory
  /** Drive provenance, set only when the file was imported from Google Drive. */
  driveFileId?: string
  driveFolderId?: string
  linkUrl?: string
}

/**
 * Create the documents row, then push the given bytes to the signed Storage URL.
 * Does NOT revalidate — callers batch uploads and call {@link finalizeUpload}
 * once at the end.
 */
export async function uploadBlobToDocuments(
  target: UploadTarget,
  blob: Blob,
  meta: UploadMeta,
): Promise<void> {
  const res = await createDocumentUploadAction({
    ...target,
    name: meta.name,
    mimeType: meta.mimeType || "application/octet-stream",
    sizeBytes: blob.size,
    category: meta.category ?? "other",
    driveFileId: meta.driveFileId,
    driveFolderId: meta.driveFolderId,
    linkUrl: meta.linkUrl,
  })
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(res.bucket)
    .uploadToSignedUrl(res.path, res.token, blob)
  if (error) throw new Error(error.message)
}

/** Refresh the parent entity page after a batch of uploads has landed. */
export async function finalizeUpload(target: UploadTarget): Promise<void> {
  await finalizeDocumentUploadAction(target)
}

/**
 * Re-attach source bytes to an EXISTING document (recovery for a 'skipped' doc
 * whose Storage object was lost). Repoints the row, pushes the new bytes to a
 * signed URL, then resets it to 'pending' so ingestion re-indexes it.
 */
export async function replaceDocumentSource(
  target: UploadTarget,
  documentId: string,
  file: File,
): Promise<void> {
  const res = await createDocumentReplacementAction({
    documentId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  })
  const supabase = createClient()
  const { error } = await supabase.storage
    .from(res.bucket)
    .uploadToSignedUrl(res.path, res.token, file)
  if (error) throw new Error(error.message)
  await finalizeDocumentReplacementAction({ ...target, documentId })
}
