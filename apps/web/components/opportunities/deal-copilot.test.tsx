/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

vi.mock("server-only", () => ({}))

import { DealCopilot } from "./deal-copilot"

const noop = vi.fn(async () => ({ ok: true, text: "x" }))

describe("DealCopilot — unconfigured state", () => {
  it("renders a disabled hint and no action buttons when no provider is configured", () => {
    render(
      <DealCopilot
        opportunityId="opp-1"
        configured={false}
        summaryAction={noop}
        emailAction={noop}
        nextBestActionAction={noop}
      />,
    )
    expect(screen.getByText(/Configure an AI provider under Admin → AI/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Summarize deal/i })).not.toBeInTheDocument()
  })
})

describe("DealCopilot — configured state", () => {
  it("renders the three actions and shows the summary result", async () => {
    const summaryAction = vi.fn(async () => ({ ok: true, text: "The deal is in Propose and progressing." }))
    render(
      <DealCopilot
        opportunityId="opp-1"
        configured
        summaryAction={summaryAction}
        emailAction={noop}
        nextBestActionAction={noop}
      />,
    )
    expect(screen.getByRole("button", { name: /Summarize deal/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /Draft follow-up email/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Next best action/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Summarize deal/i }))

    await waitFor(() =>
      expect(screen.getByText("The deal is in Propose and progressing.")).toBeInTheDocument(),
    )
    expect(summaryAction).toHaveBeenCalledWith("opp-1")
  })

  it("puts the drafted email into an editable textarea", async () => {
    const emailAction = vi.fn(async () => ({ ok: true, text: "Subject: Following up\n\nHi [name]," }))
    render(
      <DealCopilot
        opportunityId="opp-1"
        configured
        summaryAction={noop}
        emailAction={emailAction}
        nextBestActionAction={noop}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Draft follow-up email/i }))

    const textarea = await screen.findByLabelText<HTMLTextAreaElement>(/Follow-up email draft/i)
    expect(textarea.value).toContain("Subject: Following up")
    // editable
    fireEvent.change(textarea, { target: { value: "edited" } })
    expect(textarea.value).toBe("edited")
  })

  it("shows an error when the action fails", async () => {
    const summaryAction = vi.fn(async () => ({ ok: false, error: "Your daily AI budget has been reached." }))
    render(
      <DealCopilot
        opportunityId="opp-1"
        configured
        summaryAction={summaryAction}
        emailAction={noop}
        nextBestActionAction={noop}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Summarize deal/i }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/daily AI budget/i))
  })
})
