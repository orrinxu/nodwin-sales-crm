/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ApprovalWorkflowsList } from "./approval-workflows-list"
import type { AdminApprovalWorkflow } from "@/lib/data/approval-workflows.types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const workflows: AdminApprovalWorkflow[] = [
  {
    id: "wf-1",
    name: "Nodwin India Approval",
    description: null,
    entityType: "opportunity",
    entityId: "e-1",
    entityName: "Nodwin India",
    active: true,
    steps: [
      { stepOrder: 1, approverRole: "sales_manager", approverUserId: null, approverName: null },
      { stepOrder: 2, approverRole: "finance", approverUserId: null, approverName: null },
    ],
  },
]

function setup(list = workflows) {
  const createAction = vi.fn().mockResolvedValue("new-id")
  const updateAction = vi.fn().mockResolvedValue(undefined)
  const deleteAction = vi.fn().mockResolvedValue(undefined)
  const replaceStepsAction = vi.fn().mockResolvedValue(undefined)
  render(
    <ApprovalWorkflowsList
      workflows={list}
      entityOptions={[{ id: "e-1", name: "Nodwin India" }]}
      userOptions={[{ id: "u-1", name: "Jane Doe" }]}
      createAction={createAction}
      updateAction={updateAction}
      deleteAction={deleteAction}
      replaceStepsAction={replaceStepsAction}
    />,
  )
  return { createAction, updateAction, deleteAction, replaceStepsAction }
}

describe("ApprovalWorkflowsList", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists workflows with their entity and step chain", () => {
    setup()
    expect(screen.getByText("Nodwin India Approval")).toBeInTheDocument()
    expect(screen.getByText("Nodwin India")).toBeInTheDocument()
    expect(screen.getByText("Sales Manager → Finance")).toBeInTheDocument()
  })

  it("shows the org-wide default label when a workflow has no entity", () => {
    setup([{ ...workflows[0], id: "wf-2", entityId: null, entityName: null }])
    expect(screen.getByText("Org-wide default")).toBeInTheDocument()
  })

  it("creates a workflow with a role step", async () => {
    const { createAction, replaceStepsAction } = setup([])
    fireEvent.click(screen.getByRole("button", { name: "New Workflow" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Create Workflow" })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "My Flow" } })
    fireEvent.click(screen.getByRole("button", { name: "Add step" }))
    // default new step is role=sales_manager
    fireEvent.click(screen.getByRole("button", { name: "Create Workflow" }))

    await waitFor(() =>
      expect(createAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My Flow", entityType: "opportunity", entityId: null, active: true }),
      ),
    )
    expect(replaceStepsAction).toHaveBeenCalledWith("new-id", {
      steps: [{ stepOrder: 1, approverRole: "sales_manager", approverUserId: null }],
    })
  })
})
