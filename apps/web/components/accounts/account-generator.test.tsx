/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("server-only", () => ({}))
// Stub the heavy create form — we only test the generator flow. It renders the
// banner when open so we can assert the review state was reached.
vi.mock("@/components/accounts/account-form", () => ({
  AccountForm: (props: { open?: boolean; banner?: React.ReactNode }) =>
    props.open ? <div data-testid="acct-form">{props.banner}</div> : null,
}))

import { AccountGenerator } from "./account-generator"
import type { GenerateAccountResult } from "@/app/(crm)/accounts/generate-actions"

function renderGen(generateAction: (i: { text?: string }) => Promise<GenerateAccountResult>) {
  return render(
    <AccountGenerator
      ownerOptions={[]}
      accountOptions={[]}
      createAction={vi.fn()}
      onSuccess={vi.fn()}
      generateAction={generateAction}
    />,
  )
}

const OK_RESULT: GenerateAccountResult = {
  ok: true,
  prefill: { name: "Acme Media" },
  resolution: {
    name: { status: "ok", source: "Acme Media", confidence: 0.9, raw: "Acme Media", display: "Acme Media" },
    website: { status: "ok", source: "acme.com", confidence: 0.8, raw: "acme.com", display: "acme.com" },
  },
  notes: [],
}

describe("AccountGenerator", () => {
  it("opens a chooser with both paths", async () => {
    renderGen(vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create account/i }))
    expect(screen.getByText(/fill it out myself/i)).toBeInTheDocument()
    expect(screen.getByText(/generate from a note/i)).toBeInTheDocument()
  })

  it("'Fill it out myself' opens the blank form", async () => {
    renderGen(vi.fn())
    await userEvent.click(screen.getByRole("button", { name: /create account/i }))
    await userEvent.click(screen.getByText(/fill it out myself/i))
    expect(screen.getByTestId("acct-form")).toBeInTheDocument()
  })

  it("generate → analyse → opens the pre-filled form with the AI review banner", async () => {
    const generateAction = vi.fn(async () => OK_RESULT)
    renderGen(generateAction)
    await userEvent.click(screen.getByRole("button", { name: /create account/i }))
    await userEvent.click(screen.getByText(/generate from a note/i))
    await userEvent.type(screen.getByPlaceholderText(/paste a note about the account/i), "note about Acme Media")
    await userEvent.click(screen.getByRole("button", { name: /analyse/i }))

    await waitFor(() => expect(screen.getByTestId("acct-form")).toBeInTheDocument())
    expect(generateAction).toHaveBeenCalledWith({ text: "note about Acme Media" })
    expect(screen.getByText(/AI-generated draft/i)).toBeInTheDocument()
  })
})
