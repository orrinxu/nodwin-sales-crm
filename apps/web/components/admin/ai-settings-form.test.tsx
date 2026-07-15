/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("server-only", () => ({}))

import { AiSettingsForm } from "./ai-settings-form"
import type { AiSettingsSafe, IngestionStatusCounts, FailedIngestionDocument } from "@/lib/data/ai-settings"

const settings: AiSettingsSafe = {
  embeddingsBaseUrl: null,
  embeddingsModel: null,
  hasEmbeddingsApiKey: false,
  generationBaseUrl: null,
  generationModel: null,
  hasGenerationApiKey: false,
  transcriptionBaseUrl: null,
  transcriptionModel: null,
  hasTranscriptionApiKey: false,
  ingestionEnabled: true,
  searchEnabled: true,
  transcriptionEnabled: true,
  embeddingsConfigured: false,
  generationConfigured: false,
  transcriptionConfigured: false,
}

function renderForm(
  counts: IngestionStatusCounts,
  failedDocuments: FailedIngestionDocument[],
  skippedDocuments: FailedIngestionDocument[] = [],
  retryFailedAction?: () => Promise<{ reset: number }>,
  saveAction: (input: unknown) => Promise<void> = vi.fn(),
) {
  return render(
    <AiSettingsForm
      settings={settings}
      counts={counts}
      failedDocuments={failedDocuments}
      skippedDocuments={skippedDocuments}
      saveAction={saveAction}
      runIngestionAction={vi.fn()}
      retryFailedAction={retryFailedAction}
    />,
  )
}

describe("AiSettingsForm — ingestion failure reasons", () => {
  it("does not render the failure panel when nothing has failed", () => {
    renderForm({ pending: 0, indexed: 3, failed: 0, skipped: 0, total: 3 }, [])
    expect(screen.queryByText(/failure reason/i)).not.toBeInTheDocument()
  })

  it("reveals each failed document's stored reason when expanded", async () => {
    const docs: FailedIngestionDocument[] = [
      { id: "d1", name: "Q3-RFP.pdf", error: "embeddings endpoint unreachable (ECONNREFUSED)", attempts: 3, failedAt: "2026-07-15T00:00:00Z" },
    ]
    renderForm({ pending: 0, indexed: 1, failed: 1, skipped: 0, total: 2 }, docs)

    // The reason is collapsed by default; the toggle advertises the count.
    const toggle = screen.getByRole("button", { name: /show failure reason \(1\)/i })
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.getByText("Q3-RFP.pdf")).toBeInTheDocument()
    expect(screen.getByText(/embeddings endpoint unreachable \(ECONNREFUSED\)/)).toBeInTheDocument()
    expect(screen.getByText(/3 attempts/)).toBeInTheDocument()
  })

  it("falls back gracefully when a failed row has no stored message", async () => {
    const docs: FailedIngestionDocument[] = [
      { id: "d2", name: "notes.txt", error: null, attempts: 1, failedAt: "2026-07-15T00:00:00Z" },
    ]
    renderForm({ pending: 0, indexed: 0, failed: 1, skipped: 0, total: 1 }, docs)
    await userEvent.click(screen.getByRole("button", { name: /show failure reason \(1\)/i }))
    expect(screen.getByText(/no reason was recorded/i)).toBeInTheDocument()
  })

  it("notes truncation when failed count exceeds the fetched list", async () => {
    const docs: FailedIngestionDocument[] = [
      { id: "d3", name: "a.pdf", error: "boom", attempts: 1, failedAt: "2026-07-15T00:00:00Z" },
    ]
    renderForm({ pending: 0, indexed: 0, failed: 60, skipped: 0, total: 60 }, docs)
    await userEvent.click(screen.getByRole("button", { name: /show failure reasons \(60\)/i }))
    expect(screen.getByText(/showing the 1 most recent of 60 failed documents/i)).toBeInTheDocument()
  })
})

describe("AiSettingsForm — retry all failed", () => {
  it("hides the retry button when nothing has failed", () => {
    renderForm({ pending: 0, indexed: 2, failed: 0, skipped: 1, total: 3 }, [], [], vi.fn())
    expect(screen.queryByRole("button", { name: /retry all failed/i })).not.toBeInTheDocument()
  })

  it("shows the failed count on the button and reports the reset result on click", async () => {
    const retry = vi.fn(async () => ({ reset: 4 }))
    renderForm({ pending: 0, indexed: 0, failed: 4, skipped: 0, total: 4 }, [], [], retry)

    const btn = screen.getByRole("button", { name: /retry all failed \(4\)/i })
    await userEvent.click(btn)

    expect(retry).toHaveBeenCalledOnce()
    expect(await screen.findByText(/4 reset to pending/i)).toBeInTheDocument()
  })

  it("does not render the button at all when no retry action is provided", () => {
    renderForm({ pending: 0, indexed: 0, failed: 3, skipped: 0, total: 3 }, [])
    expect(screen.queryByRole("button", { name: /retry all failed/i })).not.toBeInTheDocument()
  })
})

describe("AiSettingsForm — transcription (voice) endpoint (ORR-737)", () => {
  const counts: IngestionStatusCounts = { pending: 0, indexed: 0, failed: 0, skipped: 0, total: 0 }

  it("renders the transcription endpoint fields and the enable toggle", () => {
    renderForm(counts, [])
    expect(screen.getByText(/transcription endpoint \(voice notes\)/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText("http://host:9000/v1")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("whisper-1")).toBeInTheDocument()
    expect(screen.getByText(/voice transcription enabled/i)).toBeInTheDocument()
  })

  it("includes the transcription config in the save payload", async () => {
    const saveAction = vi.fn<(input: unknown) => Promise<void>>()
    renderForm(counts, [], [], undefined, saveAction)

    await userEvent.type(screen.getByPlaceholderText("http://host:9000/v1"), "http://whisper:9000/v1")
    await userEvent.type(screen.getByPlaceholderText("whisper-1"), "whisper-large")
    await userEvent.click(screen.getByRole("button", { name: /save settings/i }))

    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction.mock.calls[0][0]).toMatchObject({
      transcriptionBaseUrl: "http://whisper:9000/v1",
      transcriptionModel: "whisper-large",
      transcriptionEnabled: true,
    })
  })
})

describe("AiSettingsForm — skipped (un-indexable) documents", () => {
  const skipped: FailedIngestionDocument[] = [
    { id: "s1", name: "old-migration.pdf", error: "Document bytes not found in storage: Object not found", attempts: 0, failedAt: "2026-07-15T00:00:00Z" },
  ]

  it("does not render the skipped panel when nothing was skipped", () => {
    renderForm({ pending: 0, indexed: 3, failed: 0, skipped: 0, total: 3 }, [])
    expect(screen.queryByText(/skipped document/i)).not.toBeInTheDocument()
  })

  it("shows a Skipped stat and reveals the un-indexable reason + guidance", async () => {
    renderForm({ pending: 0, indexed: 1, failed: 0, skipped: 1, total: 2 }, [], skipped)
    expect(screen.getByText("Skipped")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /show skipped document \(1\)/i }))
    expect(screen.getByText("old-migration.pdf")).toBeInTheDocument()
    expect(screen.getByText(/object not found/i)).toBeInTheDocument()
    expect(screen.getByText(/re-upload the file to index it, or remove the document/i)).toBeInTheDocument()
    // Skipped rows are not "attempts" — no retry semantics shown.
    expect(screen.queryByText(/attempt/i)).not.toBeInTheDocument()
  })
})
