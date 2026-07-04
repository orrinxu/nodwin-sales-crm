/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ApprovalDecisionBox } from "./approval-decision-box"

describe("ApprovalDecisionBox", () => {
  it("approves with the typed comment", () => {
    const onDecide = vi.fn()
    render(<ApprovalDecisionBox stepId="step-1" pending={false} onDecide={onDecide} />)
    fireEvent.change(screen.getByLabelText("Approval comment"), { target: { value: "ship it" } })
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onDecide).toHaveBeenCalledWith("step-1", "approved", "ship it")
  })

  it("rejects (empty comment allowed)", () => {
    const onDecide = vi.fn()
    render(<ApprovalDecisionBox stepId="step-2" pending={false} onDecide={onDecide} />)
    fireEvent.click(screen.getByRole("button", { name: "Reject" }))
    expect(onDecide).toHaveBeenCalledWith("step-2", "rejected", "")
  })

  it("skips (empty comment allowed)", () => {
    const onDecide = vi.fn()
    render(<ApprovalDecisionBox stepId="step-3" pending={false} onDecide={onDecide} />)
    fireEvent.click(screen.getByRole("button", { name: "Skip" }))
    expect(onDecide).toHaveBeenCalledWith("step-3", "skipped", "")
  })

  it("disables the buttons while a decision is pending", () => {
    render(<ApprovalDecisionBox stepId="step-4" pending onDecide={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled()
  })
})
