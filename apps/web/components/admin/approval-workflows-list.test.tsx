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
    appliesToEntityId: "e-2",
    appliesToEntityName: "East Asia",
    triggerStage: "meet_and_present",
    enforceGate: true,
    active: true,
    steps: [
      {
        stepOrder: 1,
        approverKind: "role",
        approverRole: "sales_manager",
        approverUserId: null,
        approverUserIds: null,
        approverName: null,
        name: "Budget Review",
        mode: "all_required",
      },
      {
        stepOrder: 2,
        approverKind: "role",
        approverRole: "finance",
        approverUserId: null,
        approverUserIds: null,
        approverName: null,
        name: null,
        mode: "all_required",
      },
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
      entityOptions={[
        { id: "e-1", name: "Nodwin India" },
        { id: "e-2", name: "East Asia" },
      ]}
      userOptions={[
        { id: "u-1", name: "Jane Doe" },
        { id: "u-2", name: "John Smith" },
      ]}
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
    expect(screen.getByText("Budget Review (Sales Manager) → Finance")).toBeInTheDocument()
  })

  it("shows the org-wide default label when a workflow has no entity", () => {
    setup([{ ...workflows[0], id: "wf-2", entityId: null, entityName: null }])
    expect(screen.getByText("Org-wide default")).toBeInTheDocument()
  })

  it("shows trigger stage and gate badges", () => {
    setup()
    expect(screen.getByText("Meet And Present")).toBeInTheDocument()
    expect(screen.getByText("Gate")).toBeInTheDocument()
  })

  it("summarizes a submitter's-manager step", () => {
    setup([
      {
        ...workflows[0],
        id: "wf-3",
        triggerStage: null,
        enforceGate: false,
        steps: [
          {
            stepOrder: 1,
            approverKind: "manager",
            approverRole: null,
            approverUserId: null,
            approverUserIds: null,
            approverName: null,
            name: null,
            mode: "all_required",
          },
        ],
      },
    ])
    expect(screen.getByText("Submitter's manager")).toBeInTheDocument()
  })

  it("creates a workflow with a role step", async () => {
    const { createAction, updateAction, replaceStepsAction } = setup([])
    fireEvent.click(screen.getByRole("button", { name: "New Workflow" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Create Workflow" })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "My Flow" } })
    fireEvent.click(screen.getByRole("button", { name: "Add step" }))
    fireEvent.click(screen.getByRole("button", { name: "Create Workflow" }))

    await waitFor(() =>
      expect(createAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My Flow", entityType: "opportunity", entityId: null, active: false }),
      ),
    )
    expect(replaceStepsAction).toHaveBeenCalledWith("new-id", {
      steps: [
        {
          stepOrder: 1,
          approverKind: "manager",
          approverRole: null,
          approverUserId: null,
          approverUserIds: null,
          name: null,
          mode: "all_required",
        },
      ],
    })
    expect(updateAction).toHaveBeenCalledWith("new-id", { active: true })
  })

  it("creates a workflow with trigger stage and enforce gate", async () => {
    const { createAction, updateAction, replaceStepsAction } = setup([])
    fireEvent.click(screen.getByRole("button", { name: "New Workflow" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Create Workflow" })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Gate Flow" } })

    // Select trigger stage
    const triggerSelect = screen.getByLabelText("Trigger stage")
    fireEvent.change(triggerSelect, { target: { value: "verbal_agreement" } })

    // Enable enforce gate (the second checkbox, after Active)
    const checkboxes = screen.getAllByRole("checkbox")
    const gateCheckbox = checkboxes[1] // second checkbox is enforce gate
    fireEvent.click(gateCheckbox)

    fireEvent.click(screen.getByRole("button", { name: "Create Workflow" }))

    await waitFor(() =>
      expect(createAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Gate Flow",
          triggerStage: "verbal_agreement",
          enforceGate: true,
          active: false,
        }),
      ),
    )
  })
})
