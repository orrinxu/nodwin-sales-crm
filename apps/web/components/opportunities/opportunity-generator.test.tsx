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

import { OpportunityGenerator } from "./opportunity-generator"
import type { GenerateOpportunityResult } from "@/app/(crm)/opportunities/generate-actions"

function renderGen(generateAction: (i: { text: string }) => Promise<GenerateOpportunityResult>) {
  return render(
    <OpportunityGenerator
      businessUnits={[]}
      createAction={vi.fn()}
      generateAction={generateAction}
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
