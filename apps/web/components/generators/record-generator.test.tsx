/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Stub the mic capture: expose a button that hands a fake recording up.
vi.mock("@/components/generators/voice-recorder", () => ({
  VoiceRecorder: ({ onRecorded }: { onRecorded: (b: Blob | null) => void }) => (
    <button type="button" onClick={() => onRecorded(new Blob(["audio"], { type: "audio/webm" }))}>
      stub-record
    </button>
  ),
}))
// The review banner isn't under test here.
vi.mock("@/components/generators/review-banner", () => ({
  GeneratorReviewBanner: () => <div data-testid="banner" />,
}))

import { RecordGenerator, type GeneratorResult } from "./record-generator"

type Prefill = { name: string }
type Result = GeneratorResult<Prefill>

function renderGen(opts: {
  transcribeAction?: (fd: FormData) => Promise<{ ok: boolean; text?: string; error?: string }>
  generateAction?: (input: { text?: string }) => Promise<Result>
}) {
  const generateAction =
    opts.generateAction ??
    vi.fn(async () => ({ ok: true, prefill: { name: "Acme" }, resolution: {}, notes: [] }) as Result)
  render(
    <RecordGenerator<Prefill, Result>
      entityLabel="account"
      createLabel="Create Account"
      generateAction={generateAction as (i: { text?: string }) => Promise<Result>}
      transcribeAction={opts.transcribeAction}
      fieldLabels={{ name: "Name" }}
      renderForm={({ open, result }) =>
        open ? <div data-testid="form">{result?.prefill ? result.prefill.name : "blank"}</div> : null
      }
    />,
  )
  return { generateAction }
}

async function openChooser() {
  await userEvent.click(screen.getByRole("button", { name: /create account/i }))
}

describe("RecordGenerator — voice path (ORR-741)", () => {
  it("offers the record option only when transcribeAction is provided", async () => {
    renderGen({ transcribeAction: vi.fn() })
    await openChooser()
    expect(screen.getByText(/record a voice note/i)).toBeInTheDocument()
  })

  it("hides the record option when no transcribeAction is provided", async () => {
    renderGen({})
    await openChooser()
    expect(screen.queryByText(/record a voice note/i)).not.toBeInTheDocument()
  })

  it("records → transcribes → feeds the transcript to generateAction and opens the form", async () => {
    const transcribeAction = vi.fn(async () => ({ ok: true, text: "spoken note about Acme" }))
    const { generateAction } = renderGen({ transcribeAction })

    await openChooser()
    await userEvent.click(screen.getByText(/record a voice note/i))

    // "Transcribe & analyse" is disabled until a recording exists.
    const analyse = screen.getByRole("button", { name: /transcribe & analyse/i })
    expect(analyse).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: /stub-record/i }))
    expect(analyse).toBeEnabled()
    await userEvent.click(analyse)

    await waitFor(() => expect(screen.getByTestId("form")).toBeInTheDocument())
    expect(transcribeAction).toHaveBeenCalledTimes(1)
    expect(generateAction).toHaveBeenCalledWith({ text: "spoken note about Acme" })
    expect(screen.getByTestId("form")).toHaveTextContent("Acme")
  })

  it("shows an error (not the form) when transcription fails", async () => {
    const transcribeAction = vi.fn(async () => ({ ok: false, error: "The service is busy." }))
    const { generateAction } = renderGen({ transcribeAction })

    await openChooser()
    await userEvent.click(screen.getByText(/record a voice note/i))
    await userEvent.click(screen.getByRole("button", { name: /stub-record/i }))
    await userEvent.click(screen.getByRole("button", { name: /transcribe & analyse/i }))

    await waitFor(() => expect(screen.getByText("The service is busy.")).toBeInTheDocument())
    expect(generateAction).not.toHaveBeenCalled()
    expect(screen.queryByTestId("form")).not.toBeInTheDocument()
  })
})
