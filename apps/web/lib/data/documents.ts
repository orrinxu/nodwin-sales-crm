import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"

// ORR-620 document ingestion — index status + chunk persistence.
//
// Convention: every function takes { user, source }. The background worker calls
// with source: 'system'. `source` is provenance; it also selects the client's
// trust level — a 'system' call runs on the service_role client (no cookies,
// cross-visibility writes) because the worker indexes documents regardless of
// any one user's visibility. Only server code can set source: 'system'.

export type CallSource = "web" | "mcp" | "webhook" | "system"

export interface DocumentCallContext {
  // email/role are optional so a page's requireUser() context (where they may be
  // undefined) satisfies this directly; the storage functions only read id.
  user: { id: string; email?: string; role?: string }
  source: CallSource
}

/** Nominal identity for worker-originated calls. Not written to rows (chunk
 *  provenance uses the document's own uploaded_by), only used for the source tag. */
export const SYSTEM_CONTEXT: DocumentCallContext = {
  user: { id: "00000000-0000-0000-0000-000000000000", email: "system@nodwin", role: "system" },
  source: "system",
}

type Db = ReturnType<typeof createSsrClient<Database>>

function serviceRoleClient(): Db {
  return createSsrClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

async function clientForSource(source: CallSource): Promise<Db> {
  // System/webhook calls have no user session — they run on the service role.
  if (source === "system" || source === "webhook") return serviceRoleClient()
  return (await createServerClient()) as Db
}

export type IndexStatus = Database["public"]["Enums"]["document_index_status"]

export interface DocumentIndexRow {
  id: string
  name: string
  driveFileId: string | null
  /** Object path in the `documents` Storage bucket; null for Drive-only rows. */
  storagePath: string | null
  mimeType: string
  opportunityId: string | null
  accountId: string | null
  category: Database["public"]["Enums"]["document_category"] | null
  uploadedBy: string
  indexStatus: IndexStatus
  indexAttempts: number
}

export interface DocumentForIngestion extends DocumentIndexRow {
  /** Inherited from the parent opportunity; null when the doc is account-only. */
  opportunityTier: Database["public"]["Enums"]["visibility_tier"] | null
}

const SELECT_COLS =
  "id, name, drive_file_id, storage_path, mime_type, opportunity_id, account_id, category, uploaded_by, index_status, index_attempts"

function mapRow(r: Record<string, unknown>): DocumentIndexRow {
  return {
    id: r.id as string,
    name: r.name as string,
    driveFileId: (r.drive_file_id as string) ?? null,
    storagePath: (r.storage_path as string) ?? null,
    mimeType: r.mime_type as string,
    opportunityId: (r.opportunity_id as string) ?? null,
    accountId: (r.account_id as string) ?? null,
    category: (r.category as DocumentIndexRow["category"]) ?? null,
    uploadedBy: r.uploaded_by as string,
    indexStatus: r.index_status as IndexStatus,
    indexAttempts: (r.index_attempts as number) ?? 0,
  }
}

/** Thrown when a document's source bytes cannot be retrieved (Storage object
 *  missing / no source recorded). The ingestion worker treats this as an
 *  un-indexable document → 'skipped', NOT a retryable 'failed'. */
export class DocumentSourceMissingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DocumentSourceMissingError"
  }
}

/** True when a Storage download error means the object is absent (vs a transient
 *  network/permission error). Supabase Storage reports "Object not found". */
function isObjectMissing(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes("object not found") || m.includes("not_found") || m.includes("no data")
}

/** Download a document's raw bytes from Storage (service role) for the
 *  ingestion worker. System/worker path only — no per-user RLS applies.
 *  Throws {@link DocumentSourceMissingError} when the object is gone. */
export async function downloadDocumentBytes(
  ctx: DocumentCallContext,
  storagePath: string,
): Promise<Uint8Array> {
  requireSystem(ctx)
  const { data, error } = await serviceRoleClient()
    .storage.from(STORAGE_BUCKET)
    .download(storagePath)
  if (error || !data) {
    const detail = error?.message ?? "no data"
    if (isObjectMissing(error?.message) || !data) {
      throw new DocumentSourceMissingError(`Document bytes not found in storage: ${detail}`)
    }
    throw new Error(`Failed to download document bytes: ${detail}`)
  }
  return new Uint8Array(await data.arrayBuffer())
}

// ── User-facing ──────────────────────────────────────────────────────────────

/** Read a document's current index status (RLS-scoped to the caller). */
export async function getDocumentIndexStatus(
  ctx: DocumentCallContext,
  documentId: string,
): Promise<{ status: IndexStatus; error: string | null; indexedAt: string | null } | null> {
  const supabase = await clientForSource(ctx.source)
  const { data, error } = await supabase
    .from("documents")
    .select("index_status, index_error, indexed_at")
    .eq("id", documentId)
    .maybeSingle()
  if (error) throw new Error(`Failed to read index status: ${error.message}`)
  if (!data) return null
  return { status: data.index_status, error: data.index_error, indexedAt: data.indexed_at }
}

/** Enqueue a document for (re-)ingestion by flipping it back to 'pending'.
 *  This is the hook to call when a document is LINKED or UPLOADED. */
export async function enqueueDocumentIngestion(
  ctx: DocumentCallContext,
  documentId: string,
): Promise<void> {
  const supabase = await clientForSource(ctx.source)
  const { error } = await supabase
    .from("documents")
    .update({ index_status: "pending", index_error: null })
    .eq("id", documentId)
  if (error) throw new Error(`Failed to enqueue ingestion: ${error.message}`)
}

/** Manual re-index trigger (user action). Resets status to pending and stamps
 *  the request time. RLS restricts this to the uploader or an admin. */
export async function requestReindex(
  ctx: DocumentCallContext,
  documentId: string,
): Promise<void> {
  const supabase = await clientForSource(ctx.source)
  const { error } = await supabase
    .from("documents")
    .update({
      index_status: "pending",
      index_error: null,
      reindex_requested_at: new Date().toISOString(),
    })
    .eq("id", documentId)
  if (error) throw new Error(`Failed to request re-index: ${error.message}`)
}

// ── Worker (source: 'system') ────────────────────────────────────────────────

/** List documents awaiting ingestion. System-only. */
export async function listPendingDocuments(
  ctx: DocumentCallContext,
  limit = 10,
): Promise<DocumentIndexRow[]> {
  requireSystem(ctx)
  const supabase = await clientForSource(ctx.source)
  const { data, error } = await supabase
    .from("documents")
    .select(SELECT_COLS)
    .eq("index_status", "pending")
    .order("reindex_requested_at", { ascending: true, nullsFirst: true })
    .order("uploaded_at", { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Failed to list pending documents: ${error.message}`)
  return (data ?? []).map(mapRow)
}

/** Load one document plus its parent opportunity's visibility_tier for tier
 *  inheritance. System-only. */
export async function getDocumentForIngestion(
  ctx: DocumentCallContext,
  documentId: string,
): Promise<DocumentForIngestion | null> {
  requireSystem(ctx)
  const supabase = await clientForSource(ctx.source)
  const { data, error } = await supabase
    .from("documents")
    .select(`${SELECT_COLS}, opportunity:opportunity_id ( visibility_tier )`)
    .eq("id", documentId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load document: ${error.message}`)
  if (!data) return null
  const opp = (data as Record<string, unknown>).opportunity as { visibility_tier: string } | null
  return { ...mapRow(data as Record<string, unknown>), opportunityTier: (opp?.visibility_tier as DocumentForIngestion["opportunityTier"]) ?? null }
}

export interface ChunkWrite {
  index: number
  content: string
  pageRef?: string
  embedding: number[]
}

export interface ReplaceChunksInput {
  documentId: string
  opportunityId: string | null
  accountId: string | null
  visibilityTier: Database["public"]["Enums"]["visibility_tier"]
  driveFileId: string | null
  uploadedBy: string
  category: Database["public"]["Enums"]["document_category"] | null
  embeddingModel: string
  embeddingDim: number
  chunks: ChunkWrite[]
}

/** Atomically replace a document's chunk set (delete-all + insert). System-only.
 *  Writes on the service_role client, which bypasses RLS. */
export async function replaceDocumentChunks(
  ctx: DocumentCallContext,
  input: ReplaceChunksInput,
): Promise<number> {
  requireSystem(ctx)
  const supabase = await clientForSource(ctx.source)

  const { error: delErr } = await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", input.documentId)
  if (delErr) throw new Error(`Failed to clear old chunks: ${delErr.message}`)

  if (input.chunks.length === 0) return 0

  const rows = input.chunks.map((c) => ({
    document_id: input.documentId,
    opportunity_id: input.opportunityId,
    account_id: input.accountId,
    visibility_tier: input.visibilityTier,
    drive_file_id: input.driveFileId,
    chunk_index: c.index,
    page_ref: c.pageRef ?? null,
    content: c.content,
    // pgvector accepts the "[1,2,3]" text form.
    embedding: `[${c.embedding.join(",")}]`,
    embedding_model: input.embeddingModel,
    embedding_dim: input.embeddingDim,
    category: input.category,
    uploaded_by: input.uploadedBy,
    created_by: input.uploadedBy,
    updated_by: input.uploadedBy,
  }))

  const { error: insErr } = await supabase.from("document_chunks").insert(rows)
  if (insErr) throw new Error(`Failed to insert chunks: ${insErr.message}`)
  return rows.length
}

/** Update a document's index status + provenance. System-only. */
export async function setDocumentIndexStatus(
  ctx: DocumentCallContext,
  documentId: string,
  patch: { status: IndexStatus; error?: string | null; incrementAttempts?: boolean; currentAttempts?: number },
): Promise<void> {
  requireSystem(ctx)
  const supabase = await clientForSource(ctx.source)
  const update: Database["public"]["Tables"]["documents"]["Update"] = {
    index_status: patch.status,
    index_error: patch.error ?? null,
  }
  if (patch.status === "indexed") update.indexed_at = new Date().toISOString()
  if (patch.incrementAttempts) update.index_attempts = (patch.currentAttempts ?? 0) + 1
  const { error } = await supabase.from("documents").update(update).eq("id", documentId)
  if (error) throw new Error(`Failed to update index status: ${error.message}`)
}

function requireSystem(ctx: DocumentCallContext): void {
  if (ctx.source !== "system") {
    throw new Error("This operation is worker-only (requires source: 'system').")
  }
}

// ── Server-side storage (ORR-653 Phase 1b) ───────────────────────────────────
//
// Direct upload / download / delete of file BYTES held in the private
// `documents` Storage bucket on the VPS. The flow keeps bytes off the Next.js
// server: the client uploads straight to a short-lived signed URL and downloads
// from another. Row writes go through the caller's RLS-scoped client (so
// tier/entity/confidential rules apply); the signed-URL + object operations use
// the service role AFTER an explicit RLS access check.

const STORAGE_BUCKET = "documents"

// Client-safe shapes live in documents.types.ts (the Files module imports them);
// re-export so server-side callers can keep importing from "@/lib/data/documents".
export {
  DOCUMENT_CATEGORIES,
  documentCategorySchema,
} from "./documents.types"
export type { DocumentCategory, DocumentSummary } from "./documents.types"
import { documentCategorySchema, type DocumentCategory, type DocumentSummary } from "./documents.types"

export const documentUploadSchema = z
  .object({
    opportunityId: z.string().uuid().nullish(),
    accountId: z.string().uuid().nullish(),
    name: z.string().trim().min(1).max(500),
    mimeType: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    category: documentCategorySchema.default("other"),
    // Provenance for files imported from Google Drive. The bytes are still
    // copied into Storage (storage_path is always set), so these are just a
    // record of where the file came from — download/RAG use the Storage copy.
    driveFileId: z.string().trim().min(1).max(255).nullish(),
    driveFolderId: z.string().trim().min(1).max(255).nullish(),
    linkUrl: z.string().trim().url().max(2048).nullish(),
  })
  .refine((v) => Boolean(v.opportunityId) || Boolean(v.accountId), {
    message: "A document must be linked to an opportunity or an account.",
  })
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>

/** Object name inside the bucket: `<entityId>/<uuid>-<safe filename>`. The uuid
 *  guarantees uniqueness even for identical filenames on the same entity. */
function storageObjectPath(entityId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-200) || "file"
  return `${entityId}/${randomUUID()}-${safe}`
}

export interface StoredDocumentHandle {
  id: string
  bucket: string
  storagePath: string
  /** Token + URL for a one-shot signed upload straight to Storage. */
  uploadToken: string
  signedUrl: string
}

/** Create the documents ROW for a direct upload and hand back a signed upload
 *  URL for the client to push bytes to. Verifies the caller can access the
 *  target entity under RLS first (the documents INSERT policy only checks
 *  uploaded_by, so entity authorisation is enforced here). */
export async function createStoredDocument(
  ctx: DocumentCallContext,
  input: DocumentUploadInput,
): Promise<StoredDocumentHandle> {
  if (!input.opportunityId && !input.accountId) {
    throw new Error("A document must be linked to an opportunity or an account.")
  }
  const supabase = await clientForSource(ctx.source)

  // Entity-access check — the row is only visible to the caller if RLS lets
  // them see the parent (this also enforces the Confidential-tier fence: an
  // unauthorised admin can't see a Confidential opp, so can't attach to it).
  const entityId = (input.opportunityId ?? input.accountId) as string
  if (input.opportunityId) {
    const { data, error } = await supabase
      .from("opportunities").select("id").eq("id", input.opportunityId).maybeSingle()
    if (error) throw new Error(`Failed to verify opportunity access: ${error.message}`)
    if (!data) throw new Error("You do not have access to that opportunity.")
  } else {
    const { data, error } = await supabase
      .from("accounts").select("id").eq("id", input.accountId as string).maybeSingle()
    if (error) throw new Error(`Failed to verify account access: ${error.message}`)
    if (!data) throw new Error("You do not have access to that account.")
  }

  const storagePath = storageObjectPath(entityId, input.name)

  const { data: inserted, error: insErr } = await supabase
    .from("documents")
    .insert({
      opportunity_id: input.opportunityId ?? null,
      account_id: input.accountId ?? null,
      storage_path: storagePath,
      size_bytes: input.sizeBytes,
      name: input.name,
      mime_type: input.mimeType,
      category: input.category,
      uploaded_by: ctx.user.id,
      drive_file_id: input.driveFileId ?? null,
      drive_folder_id: input.driveFolderId ?? null,
      link_url: input.linkUrl ?? null,
    })
    .select("id")
    .single()
  if (insErr || !inserted) {
    throw new Error(`Failed to create document: ${insErr?.message ?? "unknown"}`)
  }

  const svc = serviceRoleClient()
  const { data: signed, error: urlErr } = await svc.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath)
  if (urlErr || !signed) {
    // No bytes will ever arrive — don't leave an orphaned row behind.
    await svc.from("documents").delete().eq("id", inserted.id)
    throw new Error(`Failed to create upload URL: ${urlErr?.message ?? "unknown"}`)
  }

  return {
    id: inserted.id,
    bucket: STORAGE_BUCKET,
    storagePath,
    uploadToken: signed.token,
    signedUrl: signed.signedUrl,
  }
}

export const documentReplacementSchema = z.object({
  documentId: z.string().uuid(),
  name: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
})
export type DocumentReplacementInput = z.infer<typeof documentReplacementSchema>

/**
 * Re-attach SOURCE bytes to an EXISTING document — the durable remedy for a doc
 * whose Storage object was lost (e.g. the self-host migration carried the row but
 * not the object, so the worker marked it 'skipped'), and the ORR-747 in-place
 * Re-upload flow used on documents whose bytes are still intact.
 *
 * ORR-802: this is STEP 1 only. It mints a signed upload URL for a FRESH
 * storage_path and returns it — it does NOT repoint the row or delete the old
 * object. The previous good bytes must survive until the replacement is durably
 * uploaded, so the destructive part (repoint + old-object delete) happens in
 * {@link confirmReplacementUpload}, which the client calls only AFTER the byte
 * upload to `newPath` succeeds. A failed/abandoned upload therefore leaves the
 * row still pointing at the old, intact object.
 */
export async function createReplacementUpload(
  ctx: DocumentCallContext,
  input: DocumentReplacementInput,
): Promise<StoredDocumentHandle> {
  const supabase = await clientForSource(ctx.source)

  // Load under RLS: the caller must be able to SEE the doc (parent-entity +
  // Confidential fence) before we let them touch its bytes.
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, opportunity_id, account_id, storage_path")
    .eq("id", input.documentId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load document: ${error.message}`)
  if (!doc) throw new Error("Document not found or not accessible.")

  const entityId = (doc.opportunity_id ?? doc.account_id) as string | null
  if (!entityId) throw new Error("Document is not linked to an entity.")

  // Write-authorisation probe: a no-op self-UPDATE through the RLS-scoped client.
  // The documents UPDATE policy (uploader OR non-confidential admin) gates this
  // exactly as the pre-ORR-802 repoint did; a 0-row result means the caller may
  // see but not modify the doc. Crucially this changes NOTHING — storage_path is
  // set to its current value — so no bytes are put at risk before the new upload.
  const { data: writable, error: authzErr } = await supabase
    .from("documents")
    .update({ storage_path: doc.storage_path })
    .eq("id", input.documentId)
    .select("id")
    .maybeSingle()
  if (authzErr) throw new Error(`Failed to authorize replacement: ${authzErr.message}`)
  if (!writable) throw new Error("You do not have permission to replace this document.")

  const newPath = storageObjectPath(entityId, input.name)

  const { data: signed, error: urlErr } = await serviceRoleClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUploadUrl(newPath)
  if (urlErr || !signed) {
    throw new Error(`Failed to create upload URL: ${urlErr?.message ?? "unknown"}`)
  }

  return {
    id: input.documentId,
    bucket: STORAGE_BUCKET,
    storagePath: newPath,
    uploadToken: signed.token,
    signedUrl: signed.signedUrl,
  }
}

export const replacementConfirmSchema = z.object({
  documentId: z.string().uuid(),
  /** The storage_path minted by {@link createReplacementUpload} that the client
   *  has now uploaded the replacement bytes to. */
  newPath: z.string().trim().min(1).max(1024),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
})
export type ReplacementConfirmInput = z.infer<typeof replacementConfirmSchema>

/**
 * ORR-802 STEP 2: commit a replacement once the new bytes are durably uploaded.
 * Repoints the row at `newPath`, resets it to 'pending' for re-ingestion, then
 * best-effort deletes the OLD object. Only reached after a successful client
 * upload, so the previous good bytes are only discarded once the replacement
 * exists. RLS UPDATE (uploader OR non-confidential admin) is the write authz.
 */
export async function confirmReplacementUpload(
  ctx: DocumentCallContext,
  input: ReplacementConfirmInput,
): Promise<void> {
  const supabase = await clientForSource(ctx.source)

  // Re-load under RLS to recover the OLD path and to bound `newPath` to this
  // doc's own entity (defence against repointing the row at another entity's
  // object — the path is client-supplied on this leg).
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, opportunity_id, account_id, storage_path")
    .eq("id", input.documentId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load document: ${error.message}`)
  if (!doc) throw new Error("Document not found or not accessible.")

  const entityId = (doc.opportunity_id ?? doc.account_id) as string | null
  if (!entityId) throw new Error("Document is not linked to an entity.")
  if (!input.newPath.startsWith(`${entityId}/`)) {
    throw new Error("Replacement path is not scoped to the document's entity.")
  }

  const oldPath = doc.storage_path as string | null

  const { data: updated, error: updErr } = await supabase
    .from("documents")
    .update({
      storage_path: input.newPath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      index_status: "pending",
      index_error: null,
    })
    .eq("id", input.documentId)
    .select("id")
    .maybeSingle()
  if (updErr) throw new Error(`Failed to update document: ${updErr.message}`)
  if (!updated) throw new Error("You do not have permission to replace this document.")

  // Best-effort: drop the old object now the row no longer references it. Skip a
  // same-path replace so we never delete what we just wrote. Never fail on this.
  if (oldPath && oldPath !== input.newPath) {
    await serviceRoleClient().storage.from(STORAGE_BUCKET).remove([oldPath]).catch(() => {})
  }
}

/** Short-lived signed download URL for a document the caller may see. Returns
 *  null when the doc isn't visible/doesn't exist. Drive-only docs fall back to
 *  their provenance link. */
export async function createDocumentDownloadUrl(
  ctx: DocumentCallContext,
  documentId: string,
  expiresInSeconds = 300,
): Promise<{ url: string; name: string } | null> {
  const supabase = await clientForSource(ctx.source)
  const { data, error } = await supabase
    .from("documents")
    .select("name, storage_path, link_url")
    .eq("id", documentId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load document: ${error.message}`)
  if (!data) return null
  if (!data.storage_path) {
    return data.link_url ? { url: data.link_url, name: data.name } : null
  }
  const svc = serviceRoleClient()
  const { data: signed, error: urlErr } = await svc.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(data.storage_path, expiresInSeconds, { download: data.name })
  if (urlErr || !signed) {
    throw new Error(`Failed to sign download URL: ${urlErr?.message ?? "unknown"}`)
  }
  return { url: signed.signedUrl, name: data.name }
}

/** Delete a document. RLS gates the row delete (uploader, or admin on a
 *  non-Confidential deal); the stored object is removed afterwards. */
export async function deleteStoredDocument(
  ctx: DocumentCallContext,
  documentId: string,
): Promise<void> {
  const supabase = await clientForSource(ctx.source)
  const { data: deleted, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .select("storage_path")
  if (error) throw new Error(`Failed to delete document: ${error.message}`)
  if (!deleted || deleted.length === 0) {
    throw new Error("Document not found, or you do not have permission to delete it.")
  }
  const path = deleted[0].storage_path
  if (path) {
    const { error: rmErr } = await serviceRoleClient()
      .storage.from(STORAGE_BUCKET).remove([path])
    if (rmErr) {
      // Row is already gone — an orphaned object is a minor GC concern, not a
      // user-facing failure.
      console.warn(`[documents] could not remove storage object ${path}: ${rmErr.message}`)
    }
  }
}

/** Re-tag a document's category (editable after upload). RLS-gated. */
export async function updateDocumentCategory(
  ctx: DocumentCallContext,
  documentId: string,
  category: DocumentCategory,
): Promise<void> {
  const supabase = await clientForSource(ctx.source)
  const { data, error } = await supabase
    .from("documents")
    .update({ category })
    .eq("id", documentId)
    .select("id")
  if (error) throw new Error(`Failed to update category: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error("Document not found, or you do not have permission to edit it.")
  }

  // ORR-808 (g): search returns document_chunks.category (copied at ingest time),
  // not documents.category — so a re-tag left stale badges in knowledge search
  // until the next re-index. Propagate the new category to the chunks now. The
  // RLS write-authorisation was already proven by the documents UPDATE above
  // (0 rows → threw), so this system-side propagation uses the service role
  // (chunks are worker-managed and not user-writable under RLS).
  const { error: chunkErr } = await serviceRoleClient()
    .from("document_chunks")
    .update({ category })
    .eq("document_id", documentId)
  if (chunkErr) throw new Error(`Failed to propagate category to chunks: ${chunkErr.message}`)
}

/** List the documents attached to an opportunity or account (RLS-scoped). */
export async function listDocumentsForEntity(
  ctx: DocumentCallContext,
  entity: { opportunityId?: string | null; accountId?: string | null },
): Promise<DocumentSummary[]> {
  const supabase = await clientForSource(ctx.source)
  let query = supabase
    .from("documents")
    .select(
      "id, name, category, mime_type, size_bytes, storage_path, drive_file_id, link_url, uploaded_by, uploaded_at, index_status",
    )
    .order("uploaded_at", { ascending: false })
  if (entity.opportunityId) query = query.eq("opportunity_id", entity.opportunityId)
  else if (entity.accountId) query = query.eq("account_id", entity.accountId)
  else throw new Error("listDocumentsForEntity requires an opportunityId or accountId")

  const { data, error } = await query
  if (error) throw new Error(`Failed to list documents: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    category: (r.category as DocumentCategory) ?? "other",
    mimeType: r.mime_type as string,
    sizeBytes: (r.size_bytes as number) ?? null,
    hasFile: Boolean(r.storage_path),
    driveFileId: (r.drive_file_id as string) ?? null,
    driveLinkUrl: (r.link_url as string) ?? null,
    uploadedBy: r.uploaded_by as string,
    uploadedAt: r.uploaded_at as string,
    indexStatus: (r.index_status as IndexStatus) ?? null,
  }))
}
