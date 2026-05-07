export const DOCUMENT_CATEGORIES = [
  "rfp",
  "budget",
  "proposal",
  "contract",
  "po",
  "invoice",
  "presentation",
  "other",
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export function getCategoryLabel(category: DocumentCategory): string {
  switch (category) {
    case "rfp": return "RFP"
    case "budget": return "Budget"
    case "proposal": return "Proposal"
    case "contract": return "Contract"
    case "po": return "PO"
    case "invoice": return "Invoice"
    case "presentation": return "Presentation"
    case "other": return "Other"
  }
}

export interface DocumentRecord {
  id: string
  opportunityId: string | null
  accountId: string | null
  driveFileId: string
  driveFolderId: string
  name: string
  mimeType: string
  category: DocumentCategory
  uploadedBy: string
  uploadedByName: string | null
  uploadedAt: string
  linkUrl: string | null
  createdAt: string
  updatedAt: string
}
