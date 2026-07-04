/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { ApprovalCard } from "./approval-card"
import type { ApprovalInstanceRecord } from "@/lib/data/approvals"
import type { UserOption } from "@/lib/data/opportunities.types"

const users: UserOption[] = [
  { id: "u-1", fullName: "Jane Doe" },
  { id: "u-2", fullName: "Ravi Kumar" },
]

const approvedInstance: ApprovalInstanceRecord = {
  id: "inst-1",
  workflowName: "East Asia Standard",
  status: "approved",
  triggeredByName: "Charlie Rep",
  createdAt: "2026-06-01T00:00:00Z",
  steps: [
    {
      id: "step-1",
      stepOrder: 0,
      approverRole: null,
      approverUserId: null,
      approverName: "Alice Admin",
      status: "approved",
      dueBy: null,
      decisions: [
        {
          id: "dec-1",
          decision: "approved",
          comment: "Looks good",
          createdAt: "2026-06-02T00:00:00Z",
          decidedByName: "Alice Admin",
        },
      ],
    },
  ],
}

describe("ApprovalCard", () => {
  it("renders the card title with status badge", () => {
    render(
      <ApprovalCard
        approvals={[]}
        approvalStatus="Not submitted"
        actionableStepId={null}
        pendingInstanceId={null}
        canAdmin={false}
        userOptions={[]}
        pending={false}
        onDecide={vi.fn()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText("Approval")).toBeInTheDocument()
    expect(screen.getByText("Not submitted")).toBeInTheDocument()
  })

  it("shows the empty state when there are no approval instances", () => {
    render(
      <ApprovalCard
        approvals={[]}
        approvalStatus="Not submitted"
        actionableStepId={null}
        pendingInstanceId={null}
        canAdmin={false}
        userOptions={[]}
        pending={false}
        onDecide={vi.fn()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(
      screen.getByText("This opportunity has not been submitted for approval."),
    ).toBeInTheDocument()
  })

  it("renders approval history with instance details", () => {
    render(
      <ApprovalCard
        approvals={[approvedInstance]}
        approvalStatus="Approved"
        actionableStepId={null}
        pendingInstanceId={null}
        canAdmin={false}
        userOptions={[]}
        pending={false}
        onDecide={vi.fn()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText("East Asia Standard")).toBeInTheDocument()
    expect(screen.getByText(/Submitted by Charlie Rep/)).toBeInTheDocument()
    expect(screen.getByText("Alice Admin")).toBeInTheDocument()
    expect(screen.getByText(/Looks good/)).toBeInTheDocument()
  })

  it("shows ApprovalDecisionBox when actionableStepId is set", () => {
    render(
      <ApprovalCard
        approvals={[]}
        approvalStatus="Pending"
        actionableStepId="step-1"
        pendingInstanceId={null}
        canAdmin={false}
        userOptions={[]}
        pending={false}
        onDecide={vi.fn()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText("This approval is waiting on you.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument()
  })

  it("shows ApprovalAdminControls when canAdmin and pendingInstanceId are set", () => {
    render(
      <ApprovalCard
        approvals={[]}
        approvalStatus="Pending"
        actionableStepId="step-1"
        pendingInstanceId="inst-1"
        canAdmin
        userOptions={users}
        pending={false}
        onDecide={vi.fn()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText("Admin controls")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel approval" })).toBeInTheDocument()
  })

  it("does not show admin controls when canAdmin is false", () => {
    render(
      <ApprovalCard
        approvals={[]}
        approvalStatus="Pending"
        actionableStepId="step-1"
        pendingInstanceId="inst-1"
        canAdmin={false}
        userOptions={users}
        pending={false}
        onDecide={vi.fn()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText("Admin controls")).not.toBeInTheDocument()
  })

  it("does not show decision box when actionableStepId is null", () => {
    render(
      <ApprovalCard
        approvals={[]}
        approvalStatus="Not submitted"
        actionableStepId={null}
        pendingInstanceId={null}
        canAdmin={false}
        userOptions={[]}
        pending={false}
        onDecide={vi.fn()}
        onReassign={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(
      screen.queryByText("This approval is waiting on you."),
    ).not.toBeInTheDocument()
  })

  it("renders correct badge variant for different statuses", () => {
    const statuses = [
      { status: "Approved", expectedClass: "default" },
      { status: "Rejected", expectedClass: "destructive" },
      { status: "Cancelled", expectedClass: "outline" },
      { status: "Not submitted", expectedClass: "secondary" },
      { status: "Pending", expectedClass: "secondary" },
    ]
    for (const { status } of statuses) {
      const { unmount } = render(
        <ApprovalCard
          approvals={[]}
          approvalStatus={status}
          actionableStepId={null}
          pendingInstanceId={null}
          canAdmin={false}
          userOptions={[]}
          pending={false}
          onDecide={vi.fn()}
          onReassign={vi.fn()}
          onCancel={vi.fn()}
        />,
      )
      expect(screen.getByText(status)).toBeInTheDocument()
      unmount()
    }
  })
})
