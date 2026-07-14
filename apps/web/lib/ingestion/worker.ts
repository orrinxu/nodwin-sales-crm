import "server-only"
import type { DriveClient, DriveFile } from "../integrations/drive/types"
import type { Embedder } from "../ai/embeddings"
import { extractText } from "./extract"
import { chunkSegments } from "./chunk"
import {
  SYSTEM_CONTEXT,
  getDocumentForIngestion,
  downloadDocumentBytes,
  listPendingDocuments,
  replaceDocumentChunks,
  setDocumentIndexStatus,
  DocumentSourceMissingError,
} from "../data/documents"

// ORR-620 ingestion worker. Runs as source: 'system'. For each pending document:
// fetch bytes transiently → extract text → chunk → embed → write chunks +
// inherited tier + provenance → mark indexed. Bytes are never persisted; they
// fall out of scope after extraction. On any failure the document is marked
// 'failed' with the error, and the attempt counter is bumped.

export interface IngestionDeps {
  drive: DriveClient
  embedder: Embedder
}

export interface IngestResult {
  documentId: string
  status: "indexed" | "failed" | "skipped"
  chunks?: number
  error?: string
}

export async function ingestDocument(
  documentId: string,
  deps: IngestionDeps,
): Promise<IngestResult> {
  const doc = await getDocumentForIngestion(SYSTEM_CONTEXT, documentId)
  if (!doc) return { documentId, status: "skipped", error: "document not found" }

  // Tier inheritance: account-only documents (no opportunity) fail closed to
  // 'confidential'. Retrieval-side tier policy is a downstream ticket.
  const visibilityTier = doc.opportunityTier ?? "confidential"

  try {
    // Bytes now live in Supabase Storage (ORR-653). Prefer the Storage copy;
    // fall back to the legacy Drive fetch for any pre-Storage row.
    let file: DriveFile
    if (doc.storagePath) {
      const bytes = await downloadDocumentBytes(SYSTEM_CONTEXT, doc.storagePath)
      file = { bytes, mimeType: doc.mimeType, name: doc.name }
    } else if (doc.driveFileId) {
      file = await deps.drive.fetchFile(doc.driveFileId)
    } else {
      throw new DocumentSourceMissingError("Document has neither a storage_path nor a drive_file_id")
    }
    const segments = await extractText(file)
    const chunks = chunkSegments(segments)

    if (chunks.length === 0) {
      // Nothing to index (empty file) — still a successful, complete pass.
      await replaceDocumentChunks(SYSTEM_CONTEXT, {
        documentId: doc.id,
        opportunityId: doc.opportunityId,
        accountId: doc.accountId,
        visibilityTier,
        driveFileId: doc.driveFileId,
        uploadedBy: doc.uploadedBy,
        category: doc.category,
        embeddingModel: "none",
        embeddingDim: 0,
        chunks: [],
      })
      await setDocumentIndexStatus(SYSTEM_CONTEXT, doc.id, { status: "indexed" })
      return { documentId, status: "indexed", chunks: 0 }
    }

    const { vectors, model, dim } = await deps.embedder.embed(chunks.map((c) => c.content))

    const written = await replaceDocumentChunks(SYSTEM_CONTEXT, {
      documentId: doc.id,
      opportunityId: doc.opportunityId,
      accountId: doc.accountId,
      visibilityTier,
      driveFileId: doc.driveFileId,
      uploadedBy: doc.uploadedBy,
      category: doc.category,
      embeddingModel: model,
      embeddingDim: dim,
      chunks: chunks.map((c, i) => ({
        index: c.index,
        content: c.content,
        pageRef: c.pageRef,
        // eslint-disable-next-line security/detect-object-injection -- REASON: i is the controlled map index over the locally-built vectors array (1:1 with chunks), not external input
        embedding: vectors[i],
      })),
    })

    await setDocumentIndexStatus(SYSTEM_CONTEXT, doc.id, { status: "indexed" })
    return { documentId, status: "indexed", chunks: written }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // A missing source (Storage object gone / no source) is un-indexable, not a
    // retryable failure — mark 'skipped' and don't bump the attempt counter, so
    // it leaves the Failed count and isn't retried forever. Genuine
    // extraction/embedding errors stay 'failed'.
    if (e instanceof DocumentSourceMissingError) {
      await setDocumentIndexStatus(SYSTEM_CONTEXT, doc.id, { status: "skipped", error: message })
      return { documentId, status: "skipped", error: message }
    }
    await setDocumentIndexStatus(SYSTEM_CONTEXT, doc.id, {
      status: "failed",
      error: message,
      incrementAttempts: true,
      currentAttempts: doc.indexAttempts,
    })
    return { documentId, status: "failed", error: message }
  }
}

/** Drain up to `limit` pending documents. Returns a per-document summary. */
export async function runIngestionBatch(
  deps: IngestionDeps,
  limit = 10,
): Promise<{ processed: number; results: IngestResult[] }> {
  const pending = await listPendingDocuments(SYSTEM_CONTEXT, limit)
  const results: IngestResult[] = []
  for (const doc of pending) {
    results.push(await ingestDocument(doc.id, deps))
  }
  return { processed: results.length, results }
}
