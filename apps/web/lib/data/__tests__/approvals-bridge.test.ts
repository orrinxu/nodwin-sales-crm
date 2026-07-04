import { describe, it, expect } from "vitest"
import {
  hydrateMachineContext,
  computeApprovalStepStates,
  isApprovalFullyApproved,
  type ApprovalInstanceRecord,
  type ApprovalStepRecord,
} from "../approvals"

function makeStep(overrides: Partial<ApprovalStepRecord> & { stepOrder: number }): ApprovalStepRecord {
  const { stepOrder, ...rest } = overrides
  return {
    id: `step-${stepOrder}`,
    stepOrder,
    approverRole: null,
    approverUserId: null,
    approverName: null,
    approverUserIds: null,
    approverNames: null,
    mode: "all_required",
    name: null,
    status: "pending",
    dueBy: null,
    decisions: [],
    ...rest,
  }
}

function makeInstance(overrides: {
  id?: string
  status?: "pending" | "approved" | "rejected" | "cancelled"
  steps?: ApprovalStepRecord[]
} = {}): ApprovalInstanceRecord {
  return {
    id: overrides.id ?? "inst-1",
    workflowName: "Test Workflow",
    status: overrides.status ?? "pending",
    triggeredByName: "Trigger User",
    createdAt: "2026-07-04T12:00:00Z",
    steps: overrides.steps ?? [],
  }
}

describe("hydrateMachineContext", () => {
  it("returns null for empty instances", () => {
    expect(hydrateMachineContext([])).toBeNull()
  })

  it("builds context for a single-step pending approval", () => {
    const result = hydrateMachineContext([
      makeInstance({
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserId: "user-1",
            approverName: "Alice",
            status: "pending",
          }),
        ],
      }),
    ])

    expect(result).not.toBeNull()
    expect(result!.steps).toHaveLength(1)
    expect(result!.steps[0].id).toBe(1)
    expect(result!.steps[0].approvers).toEqual([{ id: "user-1", name: "Alice" }])
    expect(result!.stepApprovals[1]?.approved).toBe(false)
    expect(result!.currentStepIndex).toBe(1)
  })

  it("builds context for a multi-approver step with approverUserIds", () => {
    const result = hydrateMachineContext([
      makeInstance({
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserIds: ["user-a", "user-b", "user-c"],
            approverNames: ["Alice", "Bob", "Carol"],
            mode: "all_required",
            status: "pending",
          }),
        ],
      }),
    ])

    expect(result!.steps[0].approvers).toHaveLength(3)
    expect(result!.steps[0].approvers[0].id).toBe("user-a")
    expect(result!.steps[0].mode).toBe("all_required")
  })

  it("builds context for a fully approved multi-step instance", () => {
    const result = hydrateMachineContext([
      makeInstance({
        status: "approved",
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserId: "user-1",
            status: "approved",
            decisions: [
              { id: "d1", decision: "approved", comment: null, createdAt: "t1", decidedByName: "Alice" },
            ],
          }),
          makeStep({
            stepOrder: 2,
            approverUserId: "user-2",
            status: "approved",
            decisions: [
              { id: "d2", decision: "approved", comment: null, createdAt: "t2", decidedByName: "Bob" },
            ],
          }),
        ],
      }),
    ])

    expect(result!.stepApprovals[1]?.approved).toBe(true)
    expect(result!.stepApprovals[2]?.approved).toBe(true)
    expect(result!.currentStepIndex).toBe(2)
  })

  it("builds context for an any_one multi-approver step with one approval", () => {
    const result = hydrateMachineContext([
      makeInstance({
        status: "approved",
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserIds: ["user-a", "user-b"],
            approverNames: ["Alice", "Bob"],
            mode: "any_one",
            status: "approved",
            decisions: [
              { id: "d1", decision: "approved", comment: null, createdAt: "t1", decidedByName: "Alice" },
            ],
          }),
        ],
      }),
    ])

    expect(result!.steps[0].mode).toBe("any_one")
    expect(result!.stepApprovals[1]?.approved).toBe(true)
    expect(result!.stepApprovals[1]?.votes["user-a"]?.approved).toBe(true)
  })

  it("handles rejected instance", () => {
    const result = hydrateMachineContext([
      makeInstance({
        status: "rejected",
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserId: "user-1",
            status: "rejected",
            decisions: [
              { id: "d1", decision: "rejected", comment: "No budget", createdAt: "t1", decidedByName: "Alice" },
            ],
          }),
        ],
      }),
    ])

    expect(result!.stepApprovals[1]?.rejected).toBe(true)
    expect(result!.stepApprovals[1]?.approved).toBe(false)
  })
})

describe("computeApprovalStepStates", () => {
  it("returns pending state for each step", () => {
    const context = hydrateMachineContext([
      makeInstance({
        steps: [
          makeStep({ stepOrder: 1, approverUserId: "u-1", status: "pending" }),
          makeStep({ stepOrder: 2, approverUserId: "u-2", status: "pending" }),
        ],
      }),
    ])!

    const states = computeApprovalStepStates(context)
    expect(states[1].stepState).toBe("pending")
    expect(states[1].canApprove).toBe(true)
    expect(states[2].stepState).toBe("pending")
    expect(states[2].canApprove).toBe(true)
  })

  it("returns approved state for completed steps", () => {
    const context = hydrateMachineContext([
      makeInstance({
        status: "approved",
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserId: "u-1",
            status: "approved",
            decisions: [{ id: "d1", decision: "approved", comment: null, createdAt: "t1", decidedByName: "Alice" }],
          }),
        ],
      }),
    ])!

    const states = computeApprovalStepStates(context)
    expect(states[1].stepState).toBe("approved")
    expect(states[1].canApprove).toBe(false)
    expect(states[1].canReject).toBe(false)
    expect(states[1].canSkip).toBe(false)
  })
})

describe("isApprovalFullyApproved", () => {
  it("returns true when all steps are approved", () => {
    const context = hydrateMachineContext([
      makeInstance({
        status: "approved",
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserId: "u-1",
            status: "approved",
            decisions: [{ id: "d1", decision: "approved", comment: null, createdAt: "t1", decidedByName: "Alice" }],
          }),
          makeStep({
            stepOrder: 2,
            approverUserId: "u-2",
            status: "approved",
            decisions: [{ id: "d2", decision: "approved", comment: null, createdAt: "t2", decidedByName: "Bob" }],
          }),
        ],
      }),
    ])!

    expect(isApprovalFullyApproved(context)).toBe(true)
  })

  it("returns false when any step is rejected", () => {
    const context = hydrateMachineContext([
      makeInstance({
        status: "rejected",
        steps: [
          makeStep({
            stepOrder: 1,
            approverUserId: "u-1",
            status: "rejected",
            decisions: [{ id: "d1", decision: "rejected", comment: null, createdAt: "t1", decidedByName: "Alice" }],
          }),
        ],
      }),
    ])!

    expect(isApprovalFullyApproved(context)).toBe(false)
  })
})
