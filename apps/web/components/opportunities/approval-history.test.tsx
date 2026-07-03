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
      },
    ]

    render(<ApprovalHistory instances={instances} />)

    expect(screen.getByText("East Asia Standard")).toBeInTheDocument()
    expect(screen.getByText(/Submitted by Charlie Rep/)).toBeInTheDocument()
    expect(screen.getByText("Alice Admin")).toBeInTheDocument()
    expect(screen.getByText(/Looks good/)).toBeInTheDocument()
  })
})
