import "server-only"
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
  user: { id: string; email: string; role: string }
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
  driveFileId: string
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
  "id, drive_file_id, mime_type, opportunity_id, account_id, category, uploaded_by, index_status, index_attempts"

function mapRow(r: Record<string, unknown>): DocumentIndexRow {
  return {
    id: r.id as string,
    driveFileId: r.drive_file_id as string,
    mimeType: r.mime_type as string,
    opportunityId: (r.opportunity_id as string) ?? null,
    accountId: (r.account_id as string) ?? null,
    category: (r.category as DocumentIndexRow["category"]) ?? null,
    uploadedBy: r.uploaded_by as string,
    indexStatus: r.index_status as IndexStatus,
    indexAttempts: (r.index_attempts as number) ?? 0,
  }
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
  driveFileId: string
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
