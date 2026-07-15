/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("server-only", () => ({}))
// Stub the heavy create form — we only test the generator's own flow. It renders
// the banner when open so we can assert the review state was reached.
vi.mock("@/components/opportunities/opportunity-form", () => ({
  OpportunityForm: (props: { open?: boolean; banner?: React.ReactNode }) =>
    props.open ? <div data-testid="opp-form">{props.banner}</div> : null,
}))
// The generator imports these at module load for the confirm-path side effects
// (provenance + RFP retention). The stubbed form never calls createAction, so
// these don't run here — mocking them just keeps the server/browser modules out.
vi.mock("@/app/(crm)/opportunities/generate-actions", () => ({
  recordExtractionProvenanceAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/documents/client-upload", () => ({
  uploadBlobToDocuments: vi.fn(async () => {}),
  finalizeUpload: vi.fn(async () => {}),
}))
// Stub the mic capture (ORR-745): a button that hands up a fake recording.
vi.mock("@/components/generators/voice-recorder", () => ({
  VoiceRecorder: ({ onRecorded }: { onRecorded: (b: Blob | null) => void }) => (
    <button type="button" onClick={() => onRecorded(new Blob(["audio"], { type: "audio/webm" }))}>
      stub-record
    </button>
  ),
}))
// The "+ New" launcher flag (ORR-746) — default off; one test flips it on.
vi.mock("@/components/generators/use-auto-open-create", () => ({
  useAutoOpenCreate: vi.fn(() => false),
}))

import { OpportunityGenerator } from "./opportunity-generator"
import { useAutoOpenCreate } from "@/components/generators/use-auto-open-create"
import type { GenerateOpportunityResult, TranscribeAudioResult } from "@/app/(crm)/opportunities/generate-actions"

function renderGen(
  generateAction: (i: { text?: string; images?: { mimeType: string; dataBase64: string }[] }) => Promise<GenerateOpportunityResult>,
  transcribeAction?: (fd: FormData) => Promise<TranscribeAudioResult>,
) {
  return render(
    <OpportunityGenerator
      businessUnits={[]}
      createAction={vi.fn()}
      generateAction={generateAction}
      transcribeAction={transcribeAction}
      onSuccess={vi.fn()}
    />,
  )
}

const OK_RESULT: GenerateOpportunityResult = {
  ok: true,
  prefill: { name: "Valorant India Invitational" },
  resolution: {
    name: { status: "ok", source: "subject", confidence: 0.9, raw: "Valorant India Invitational", display: "Valorant India Invitational" },
    account: { status: "unmatched", source: "from Acme", confidence: 0.7, raw: "Acme Corp", display: "Acme Corp" },
  },
  notes: ["No existing account matches \"Acme Corp\" — you can create it."],
}

describe("OpportunityGenerator", () => {
  it("opens a chooser with both paths", async () => {
    renderGen(vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    expect(screen.getByText(/fill it out myself/i)).toBeInTheDocument()
    expect(screen.getByText(/generate from a document/i)).toBeInTheDocument()
  })

  it("'Fill it out myself' opens the blank form", async () => {
    renderGen(vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    await userEvent.click(screen.getByText(/fill it out myself/i))
    expect(screen.getByTestId("opp-form")).toBeInTheDocument()
  })

  it("auto-opens the chooser when the launcher routed here (ORR-746)", async () => {
    vi.mocked(useAutoOpenCreate).mockReturnValueOnce(true)
    renderGen(vi.fn())
    // No click on "Create Opportunity" — the chooser is open from mount.
    await waitFor(() => expect(screen.getByText(/fill it out myself/i)).toBeInTheDocument())
    expect(screen.getByText(/generate from a document/i)).toBeInTheDocument()
  })

  it("generate → analyse → opens the pre-filled form with the AI review banner", async () => {
    const generateAction = vi.fn(async () => OK_RESULT)
    renderGen(generateAction)
    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    await userEvent.click(screen.getByText(/generate from a document/i))

    // Analyse is disabled until there is text.
    const analyse = screen.getByRole("button", { name: /analyse/i })
    expect(analyse).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText(/paste the rfp/i), "Deal with Acme Corp for INR 50,00,000")
    expect(analyse).toBeEnabled()
    await userEvent.click(analyse)

    await waitFor(() => expect(generateAction).toHaveBeenCalledTimes(1))
    expect(generateAction).toHaveBeenCalledWith({ text: "Deal with Acme Corp for INR 50,00,000" })
    // The form opened with the review banner (needs-review for the unmatched account).
    await waitFor(() => expect(screen.getByTestId("opp-form")).toBeInTheDocument())
    expect(screen.getByText(/AI-generated from your document/i)).toBeInTheDocument()
    expect(screen.getByText(/needs review/i)).toBeInTheDocument()
  })

  it("shows an error state when generation fails", async () => {
    const generateAction = vi.fn(async () => ({ ok: false, error: "The document could not be read." }))
    renderGen(generateAction)
    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    await userEvent.click(screen.getByText(/generate from a document/i))
    await userEvent.type(screen.getByPlaceholderText(/paste the rfp/i), "garbled")
    await userEvent.click(screen.getByRole("button", { name: /analyse/i }))
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeInTheDocument())
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
  })
})

describe("OpportunityGenerator — voice path (ORR-745)", () => {
  it("offers the record option only when transcribeAction is provided", async () => {
    renderGen(vi.fn(), vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    expect(screen.getByText(/record a voice note/i)).toBeInTheDocument()
  })

  it("hides the record option when no transcribeAction is provided", async () => {
    renderGen(vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    expect(screen.queryByText(/record a voice note/i)).not.toBeInTheDocument()
  })

  it("records → transcribes → feeds the transcript to generateAction and opens the pre-filled form", async () => {
    const transcribeAction = vi.fn(async () => ({ ok: true, text: "spoken note about Acme Corp" }))
    const generateAction = vi.fn(async () => OK_RESULT)
    renderGen(generateAction, transcribeAction)

    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    await userEvent.click(screen.getByText(/record a voice note/i))

    // "Transcribe & analyse" is disabled until a recording exists.
    const analyse = screen.getByRole("button", { name: /transcribe & analyse/i })
    expect(analyse).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: /stub-record/i }))
    expect(analyse).toBeEnabled()
    await userEvent.click(analyse)

    await waitFor(() => expect(transcribeAction).toHaveBeenCalledTimes(1))
    expect(generateAction).toHaveBeenCalledWith({ text: "spoken note about Acme Corp" })
    await waitFor(() => expect(screen.getByTestId("opp-form")).toBeInTheDocument())
    expect(screen.getByText(/AI-generated from your document/i)).toBeInTheDocument()
  })

  it("shows an error (not the form) when transcription fails", async () => {
    const transcribeAction = vi.fn(async () => ({ ok: false, error: "The transcription service is busy." }))
    const generateAction = vi.fn(async () => OK_RESULT)
    renderGen(generateAction, transcribeAction)

    await userEvent.click(screen.getByRole("button", { name: /create opportunity/i }))
    await userEvent.click(screen.getByText(/record a voice note/i))
    await userEvent.click(screen.getByRole("button", { name: /stub-record/i }))
    await userEvent.click(screen.getByRole("button", { name: /transcribe & analyse/i }))

    await waitFor(() => expect(screen.getByText("The transcription service is busy.")).toBeInTheDocument())
    expect(generateAction).not.toHaveBeenCalled()
    expect(screen.queryByTestId("opp-form")).not.toBeInTheDocument()
  })
})
