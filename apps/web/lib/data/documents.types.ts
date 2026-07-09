import type { Database } from "@/lib/database.types"

// Client-safe document_category labels (documents.ts is server-only). Acronyms
// are cased correctly (RFP, PO) — a plain capitalize would render "Rfp"/"Po".
export type DocumentCategory = Database["public"]["Enums"]["document_category"]

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  rfp: "RFP",
  budget: "Budget",
  proposal: "Proposal",
  contract: "Contract",
  po: "PO",
  invoice: "Invoice",
  presentation: "Presentation",
  other: "Other",
}

/** Human label for a document category; null-safe, falls back to a capitalized raw value. */
export function documentCategoryLabel(
  category: string | null | undefined,
): string | null {
  if (!category) return null
  return (
    DOCUMENT_CATEGORY_LABELS[category as DocumentCategory] ??
    category.charAt(0).toUpperCase() + category.slice(1)
  )
}
