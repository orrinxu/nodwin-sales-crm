/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))

const { action } = vi.hoisted(() => ({ action: vi.fn() }))
vi.mock("@/app/(crm)/opportunities/actions", () => ({ breakGlassConfidentialAction: action }))

import { BreakGlassGate } from "./break-glass-gate"

function renderGate() {
  return render(
    <BreakGlassGate opportunityId="opp-1" opportunityName="Secret Deal" ownerName="Dana" />,
  )
}

describe("BreakGlassGate (ORR-716)", () => {
  beforeEach(() => { action.mockReset(); refresh.mockReset() })

  it("shows the Confidential notice and the break-glass affordance", () => {
    renderGate()
    expect(screen.getByRole("heading", { name: /confidential deal/i })).toBeInTheDocument()
    expect(screen.getByText(/Secret Deal/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /break-glass access/i })).toBeInTheDocument()
  })

  it("requires a reason before the grant can be confirmed", async () => {
    renderGate()
    await userEvent.click(screen.getByRole("button", { name: /break-glass access/i }))
    const confirm = screen.getByRole("button", { name: /confirm break-glass/i })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText(/why do you need access/i), "Compliance review")
    expect(confirm).toBeEnabled()
  })

  it("on success calls the action and refreshes the page", async () => {
    action.mockResolvedValue({ ok: true })
    renderGate()
    await userEvent.click(screen.getByRole("button", { name: /break-glass access/i }))
    await userEvent.type(screen.getByPlaceholderText(/why do you need access/i), "Compliance review")
    await userEvent.click(screen.getByRole("button", { name: /confirm break-glass/i }))

    await waitFor(() => expect(action).toHaveBeenCalledWith({ opportunityId: "opp-1", reason: "Compliance review" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("shows the error and does not refresh when the grant is refused", async () => {
    action.mockResolvedValue({ ok: false, error: "Only founders can break-glass into a Confidential deal." })
    renderGate()
    await userEvent.click(screen.getByRole("button", { name: /break-glass access/i }))
    await userEvent.type(screen.getByPlaceholderText(/why do you need access/i), "let me in")
    await userEvent.click(screen.getByRole("button", { name: /confirm break-glass/i }))

    await waitFor(() => expect(screen.getByText(/only founders can break-glass/i)).toBeInTheDocument())
    expect(refresh).not.toHaveBeenCalled()
  })
})
