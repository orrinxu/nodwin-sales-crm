import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("server-only", () => ({}))

const createDocumentUploadAction = vi.fn()
const finalizeDocumentUploadAction = vi.fn().mockResolvedValue(undefined)
const getDocumentDownloadUrlAction = vi.fn()
const deleteDocumentAction = vi.fn().mockResolvedValue(undefined)
const updateDocumentCategoryAction = vi.fn().mockResolvedValue(undefined)
vi.mock("@/app/(crm)/documents/actions", () => ({
  createDocumentUploadAction: (...a: unknown[]) => createDocumentUploadAction(...a),
  finalizeDocumentUploadAction: (...a: unknown[]) => finalizeDocumentUploadAction(...a),
  getDocumentDownloadUrlAction: (...a: unknown[]) => getDocumentDownloadUrlAction(...a),
  deleteDocumentAction: (...a: unknown[]) => deleteDocumentAction(...a),
  updateDocumentCategoryAction: (...a: unknown[]) => updateDocumentCategoryAction(...a),
}))

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const uploadToSignedUrl = vi.fn().mockResolvedValue({ data: {}, error: null })
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}))

import { FilesModule } from "./files-module"
import type { DocumentSummary } from "@/lib/data/documents"

const doc: DocumentSummary = {
  id: "d1",
  name: "Proposal.pdf",
  category: "proposal",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  hasFile: true,
  driveFileId: null,
  driveLinkUrl: null,
  uploadedBy: "u1",
  uploadedAt: "2026-06-01T12:00:00Z",
  indexStatus: null,
}

beforeEach(() => vi.clearAllMocks())

describe("FilesModule", () => {
  it("shows a drop/upload empty state when there are no files", () => {
    render(<FilesModule opportunityId="opp1" initialDocuments={[]} />)
    expect(screen.getByText("Files (0)")).toBeInTheDocument()
    expect(screen.getByText(/Drop a file here/i)).toBeInTheDocument()
  })

  it("groups files by category label", () => {
    render(<FilesModule opportunityId="opp1" initialDocuments={[doc]} />)
    expect(screen.getByText("Proposal (1)")).toBeInTheDocument()
    expect(screen.getByText("Proposal.pdf")).toBeInTheDocument()
  })

  it("deletes a file: calls the action with the entity ref and removes it optimistically", async () => {
    const user = userEvent.setup()
    render(<FilesModule opportunityId="opp1" initialDocuments={[doc]} />)
    await user.click(screen.getByRole("button", { name: "Delete Proposal.pdf" }))
    expect(deleteDocumentAction).toHaveBeenCalledWith({ opportunityId: "opp1", documentId: "d1" })
    await waitFor(() => expect(screen.queryByText("Proposal.pdf")).not.toBeInTheDocument())
    expect(screen.getByText("Files (0)")).toBeInTheDocument()
  })

  it("uploads a picked file: create → push bytes to signed URL → finalize", async () => {
    createDocumentUploadAction.mockResolvedValue({
      documentId: "d2",
      bucket: "documents",
      path: "opp1/x.pdf",
      token: "tok",
      signedUrl: "https://up",
    })
    const user = userEvent.setup()
    const { container } = render(<FilesModule accountId="acc1" initialDocuments={[]} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], "Deck.pdf", { type: "application/pdf" })
    await user.upload(input, file)
    await waitFor(() => expect(createDocumentUploadAction).toHaveBeenCalledTimes(1))
    expect(createDocumentUploadAction).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc1", name: "Deck.pdf", mimeType: "application/pdf" }),
    )
    expect(uploadToSignedUrl).toHaveBeenCalledWith("opp1/x.pdf", "tok", file)
    await waitFor(() => expect(finalizeDocumentUploadAction).toHaveBeenCalledWith({ accountId: "acc1" }))
  })
})
