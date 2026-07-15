/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("server-only", () => ({}))
// The "+ New" launcher flag (ORR-746) — default off; one test flips it on.
vi.mock("@/components/generators/use-auto-open-create", () => ({
  useAutoOpenCreate: vi.fn(() => false),
}))
// Stub the heavy create form — we only test the generator flow. It renders the
// banner (and the prefilled name) when open so we can assert the review state.
vi.mock("@/components/contacts/contact-form", () => ({
  ContactForm: (props: { open?: boolean; banner?: React.ReactNode; prefill?: { fullName?: string } }) =>
    props.open ? (
      <div data-testid="contact-form">
        {props.banner}
        <span data-testid="prefill-name">{props.prefill?.fullName}</span>
      </div>
    ) : null,
}))

import { ContactGenerator } from "./contact-generator"
import { useAutoOpenCreate } from "@/components/generators/use-auto-open-create"
import type { GenerateContactResult } from "@/app/(crm)/contacts/generate-actions"

function renderGen(generateAction: (i: { text?: string }) => Promise<GenerateContactResult>) {
  return render(
    <ContactGenerator
      accounts={[]}
      createAction={vi.fn()}
      onSuccess={vi.fn()}
      generateAction={generateAction}
    />,
  )
}

const OK_RESULT: GenerateContactResult = {
  ok: true,
  prefill: { fullName: "Dana Reyes", primaryAccountId: "acct-1" },
  resolution: {
    fullName: { status: "ok", source: "Dana Reyes", confidence: 0.9, raw: "Dana Reyes", display: "Dana Reyes" },
    account: { status: "matched", source: "Acme Media", confidence: 0.8, raw: "Acme Media", display: "Acme Media" },
  },
  notes: [],
}

describe("ContactGenerator", () => {
  it("opens a chooser with both paths", async () => {
    renderGen(vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }))
    expect(screen.getByText(/fill it out myself/i)).toBeInTheDocument()
    expect(screen.getByText(/generate from a note/i)).toBeInTheDocument()
  })

  it("auto-opens the chooser when the launcher routed here (ORR-746)", async () => {
    vi.mocked(useAutoOpenCreate).mockReturnValueOnce(true)
    renderGen(vi.fn())
    await waitFor(() => expect(screen.getByText(/fill it out myself/i)).toBeInTheDocument())
    expect(screen.getByText(/generate from a note/i)).toBeInTheDocument()
  })

  it("'Fill it out myself' opens the blank form", async () => {
    renderGen(vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }))
    await userEvent.click(screen.getByText(/fill it out myself/i))
    expect(screen.getByTestId("contact-form")).toBeInTheDocument()
  })

  it("generate → analyse → opens the pre-filled form with the AI review banner", async () => {
    const generateAction = vi.fn(async () => OK_RESULT)
    renderGen(generateAction)
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }))
    await userEvent.click(screen.getByText(/generate from a note/i))
    await userEvent.type(screen.getByPlaceholderText(/paste a note about the contact/i), "note about Dana Reyes")
    await userEvent.click(screen.getByRole("button", { name: /analyse/i }))

    await waitFor(() => expect(screen.getByTestId("contact-form")).toBeInTheDocument())
    expect(generateAction).toHaveBeenCalledWith({ text: "note about Dana Reyes" })
    expect(screen.getByText(/AI-generated draft/i)).toBeInTheDocument()
    expect(screen.getByTestId("prefill-name")).toHaveTextContent("Dana Reyes")
  })
})
