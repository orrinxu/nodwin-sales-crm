/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { DocumentList } from "./document-list"
import type { DocumentRecord } from "@/lib/data/documents.types"

vi.mock("server-only", () => ({}))

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    opportunityId: "opp-1",
    accountId: null,
    driveFileId: "drive-file-1",
    driveFolderId: "drive-folder-1",
    name: "Signed Contract",
    mimeType: "application/pdf",
    category: "contract",
    uploadedBy: "user-1",
    uploadedByName: "Alice",
    uploadedAt: "2026-04-01T10:00:00Z",
    linkUrl: "https://drive.google.com/file/123",
    createdAt: "2026-04-01T10:00:00Z",
    updatedAt: "2026-04-01T10:00:00Z",
    ...overrides,
  }
}

describe("DocumentList", () => {
  describe("empty state", () => {
    it("shows empty message when no documents", () => {
      render(<DocumentList documents={[]} />)
      expect(screen.getByText(/No documents yet/)).toBeInTheDocument()
    })
  })

  describe("document rendering", () => {
    it("renders document name", () => {
      render(<DocumentList documents={[makeDocument()]} />)
      expect(screen.getByText("Signed Contract")).toBeInTheDocument()
    })

    it("renders category badge", () => {
      render(<DocumentList documents={[makeDocument()]} />)
      expect(screen.getByText("Contract")).toBeInTheDocument()
    })

    it("renders uploader name", () => {
      render(<DocumentList documents={[makeDocument()]} />)
      expect(screen.getByText("Alice")).toBeInTheDocument()
    })

    it("renders formatted date", () => {
      render(<DocumentList documents={[makeDocument()]} />)
      expect(screen.getByText("Apr 1, 2026")).toBeInTheDocument()
    })

    it("shows 'Unknown' when uploader name is null", () => {
      render(
        <DocumentList
          documents={[makeDocument({ uploadedByName: null })]}
        />,
      )
      expect(screen.getByText("Unknown")).toBeInTheDocument()
    })

    it("renders external link when linkUrl is present", () => {
      render(<DocumentList documents={[makeDocument()]} />)
      const link = screen.getByTitle("Open document")
      expect(link).toHaveAttribute("href", "https://drive.google.com/file/123")
      expect(link).toHaveAttribute("target", "_blank")
    })

    it("does not render external link when linkUrl is null", () => {
      render(
        <DocumentList
          documents={[makeDocument({ linkUrl: null })]}
        />,
      )
      expect(screen.queryByTitle("Open document")).not.toBeInTheDocument()
    })

    it("renders multiple documents", () => {
      const docs = [
        makeDocument({ id: "doc-1", name: "Contract A" }),
        makeDocument({ id: "doc-2", name: "Proposal B" }),
      ]
      render(<DocumentList documents={docs} />)
      expect(screen.getByText("Contract A")).toBeInTheDocument()
      expect(screen.getByText("Proposal B")).toBeInTheDocument()
    })
  })
})
