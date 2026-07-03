/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AllowedDomainsList } from "./allowed-domains-list"
import type { AllowedDomainRecord } from "@/lib/data/allowed-domains"

const mockRefresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("server-only", () => ({}))

const sampleDomains: AllowedDomainRecord[] = [
  { id: "d-1", domain: "nodwin.com", createdAt: "2026-01-01T00:00:00Z" },
  { id: "d-2", domain: "trinitygaming.in", createdAt: "2026-02-01T00:00:00Z" },
]

function makeProps(overrides: Partial<React.ComponentProps<typeof AllowedDomainsList>> = {}) {
  return {
    domains: sampleDomains,
    createAction: vi.fn().mockResolvedValue({ id: "d-3", domain: "maxlevel.gg", createdAt: "2026-03-01T00:00:00Z" }),
    deleteAction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe("AllowedDomainsList", () => {
  beforeEach(() => {
    mockRefresh.mockClear()
  })

  it("renders each allowed domain", () => {
    render(<AllowedDomainsList {...makeProps()} />)
    expect(screen.getByText("nodwin.com")).toBeInTheDocument()
    expect(screen.getByText("trinitygaming.in")).toBeInTheDocument()
  })

  it("shows an empty state when there are no domains", () => {
    render(<AllowedDomainsList {...makeProps({ domains: [] })} />)
    expect(screen.getByText("No allowed domains")).toBeInTheDocument()
  })

  it("submits the add form with the entered domain", async () => {
    const props = makeProps()
    render(<AllowedDomainsList {...props} />)

    await userEvent.type(screen.getByLabelText("Domain"), "maxlevel.gg")
    await userEvent.click(screen.getByRole("button", { name: /add domain/i }))

    await waitFor(() => {
      expect(props.createAction).toHaveBeenCalledWith({ domain: "maxlevel.gg" })
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("keeps the add button disabled until a value is entered", () => {
    render(<AllowedDomainsList {...makeProps()} />)
    expect(screen.getByRole("button", { name: /add domain/i })).toBeDisabled()
  })

  it("surfaces a server error from the add action", async () => {
    const props = makeProps({
      createAction: vi.fn().mockRejectedValue(new Error('"nodwin.com" is already an allowed domain.')),
    })
    render(<AllowedDomainsList {...props} />)

    await userEvent.type(screen.getByLabelText("Domain"), "nodwin.com")
    await userEvent.click(screen.getByRole("button", { name: /add domain/i }))

    expect(await screen.findByText('"nodwin.com" is already an allowed domain.')).toBeInTheDocument()
  })

  it("removes a domain after confirming in the dialog", async () => {
    const props = makeProps()
    render(<AllowedDomainsList {...props} />)

    await userEvent.click(screen.getByRole("button", { name: "Remove nodwin.com" }))
    // Confirmation dialog appears.
    const confirm = await screen.findByRole("button", { name: "Remove" })
    await userEvent.click(confirm)

    await waitFor(() => {
      expect(props.deleteAction).toHaveBeenCalledWith("d-1")
    })
  })
})
