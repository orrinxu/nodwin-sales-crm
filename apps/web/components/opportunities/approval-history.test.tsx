/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { ApprovalHistory } from "./approval-history"
import type { ApprovalInstanceRecord } from "@/lib/data/approvals"

describe("ApprovalHistory", () => {
  it("shows an empty state when there are no instances", () => {
    render(<ApprovalHistory instances={[]} />)
    expect(
      screen.getByText("This opportunity has not been submitted for approval."),
    ).toBeInTheDocument()
  })

  it("renders workflow name, status, steps and decisions", () => {
    const instances: ApprovalInstanceRecord[] = [
      {
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
            approverUserIds: null,
            approverNames: null,
            mode: null,
            name: null,
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
      },
    ]

    render(<ApprovalHistory instances={instances} />)

    expect(screen.getByText("East Asia Standard")).toBeInTheDocument()
    expect(screen.getByText(/Submitted by Charlie Rep/)).toBeInTheDocument()
    expect(screen.getByText("Alice Admin")).toBeInTheDocument()
    expect(screen.getByText(/Looks good/)).toBeInTheDocument()
  })

  it("renders multi-approver step with mode indicator", () => {
    const instances: ApprovalInstanceRecord[] = [
      {
        id: "inst-2",
        workflowName: "Multi-step Workflow",
        status: "pending",
        triggeredByName: "Bob Owner",
        createdAt: "2026-06-10T00:00:00Z",
        steps: [
          {
            id: "step-1",
            stepOrder: 0,
            approverRole: null,
            approverUserId: null,
            approverName: null,
            approverUserIds: ["u-1", "u-2", "u-3"],
            approverNames: ["Jane Doe", "Ravi Kumar", "Mike Chen"],
            mode: "any_one",
            name: "Initial Review",
            status: "pending",
            dueBy: null,
            decisions: [],
          },
        ],
      },
    ]

    render(<ApprovalHistory instances={instances} />)

    expect(screen.getByText("Initial Review")).toBeInTheDocument()
    expect(screen.getByText("Jane Doe, Ravi Kumar, Mike Chen")).toBeInTheDocument()
    expect(screen.getByText("Any one")).toBeInTheDocument()
  })

  it("renders all_required mode with approver count fallback when names not resolved", () => {
    const instances: ApprovalInstanceRecord[] = [
      {
        id: "inst-3",
        workflowName: "Full Board",
        status: "pending",
        triggeredByName: "CEO",
        createdAt: "2026-06-15T00:00:00Z",
        steps: [
          {
            id: "step-1",
            stepOrder: 0,
            approverRole: null,
            approverUserId: null,
            approverName: null,
            approverUserIds: ["u-a", "u-b"],
            approverNames: null,
            mode: "all_required",
            name: "Board Approval",
            status: "pending",
            dueBy: null,
            decisions: [],
          },
        ],
      },
    ]

    render(<ApprovalHistory instances={instances} />)

    expect(screen.getByText("Board Approval")).toBeInTheDocument()
    expect(screen.getByText("2 approvers")).toBeInTheDocument()
    expect(screen.getByText("All required")).toBeInTheDocument()
  })

  it("renders step with name from template, falling back to approver/role/order", () => {
    const instances: ApprovalInstanceRecord[] = [
      {
        id: "inst-4",
        workflowName: "Simple",
        status: "pending",
        triggeredByName: "User",
        createdAt: "2026-07-01T00:00:00Z",
        steps: [
          {
            id: "step-a",
            stepOrder: 0,
            approverRole: "admin",
            approverUserId: null,
            approverName: null,
            approverUserIds: null,
            approverNames: null,
            mode: null,
            name: null,
            status: "pending",
            dueBy: null,
            decisions: [],
          },
          {
            id: "step-b",
            stepOrder: 1,
            approverRole: null,
            approverUserId: null,
            approverName: null,
            approverUserIds: null,
            approverNames: null,
            mode: null,
            name: null,
            status: "pending",
            dueBy: null,
            decisions: [],
          },
        ],
      },
    ]

    render(<ApprovalHistory instances={instances} />)

    expect(screen.getByText("admin")).toBeInTheDocument()
    expect(screen.getByText("Step 2")).toBeInTheDocument()
  })
})
