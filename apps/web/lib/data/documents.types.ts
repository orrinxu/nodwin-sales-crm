// Client-safe document shapes shared by the server data layer (documents.ts)
// and the client Files module. MUST NOT import "server-only" — the Files module
// is a client component and pulls this in.
import { z } from "zod"
import type { Database } from "@/lib/database.types"

type IndexStatus = Database["public"]["Enums"]["document_index_status"]

/** All document category values, in a UI-friendly order. Mirrors the
 *  document_category enum; shared with the Files module + upload validation. */
export const DOCUMENT_CATEGORIES = [
  "rfp",
  "proposal",
  "budget",
  "contract",
  "po",
  "invoice",
  "presentation",
  "brand_guidelines",
  "logo_assets",
  "rate_card",
  "other",
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES)

/** A document as shown in the Files module (RLS-scoped list row). */
export interface DocumentSummary {
  id: string
  name: string
  category: DocumentCategory
  mimeType: string
  sizeBytes: number | null
  /** True when bytes are stored on the VPS (vs a Drive-only reference). */
  hasFile: boolean
  driveFileId: string | null
  driveLinkUrl: string | null
  uploadedBy: string
  uploadedAt: string
  indexStatus: IndexStatus | null
}
