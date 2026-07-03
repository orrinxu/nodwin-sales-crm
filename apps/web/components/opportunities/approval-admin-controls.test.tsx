/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ApprovalAdminControls } from "./approval-admin-controls"

const users = [
  { id: "u-1", fullName: "Jane Doe" },
  { id: "u-2", fullName: "Ravi Kumar" },
]

describe("ApprovalAdminControls", () => {
  it("reassigns the current step to the chosen user", () => {
    const onReassign = vi.fn()
    render(
      <ApprovalAdminControls stepId="step-1" instanceId="inst-1" users={users} pending={false} onReassign={onReassign} onCancel={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText("Reassign current step to"), { target: { value: "u-2" } })
    fireEvent.click(screen.getByRole("button", { name: "Reassign" }))
    expect(onReassign).toHaveBeenCalledWith("step-1", "u-2")
  })

  it("cancels the approval", () => {
    const onCancel = vi.fn()
    render(
      <ApprovalAdminControls stepId="step-1" instanceId="inst-1" users={users} pending={false} onReassign={vi.fn()} onCancel={onCancel} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Cancel approval" }))
    expect(onCancel).toHaveBeenCalledWith("inst-1")
  })

  it("hides reassign when no step is actionable but still allows cancel", () => {
    render(
      <ApprovalAdminControls stepId={null} instanceId="inst-1" users={users} pending={false} onReassign={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel approval" })).toBeInTheDocument()
  })
})
