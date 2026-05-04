import { describe, it, expect } from "vitest"
import { createActor } from "xstate"
import {
  approvalMachine,
  stepMachine,
  initialContext,
  getApprovalStepState,
  checkCanTransitionToApproved,
  type ApprovalContext,
} from "./approval"

describe("Approval State Machine", () => {
  describe("Happy Path - Sequential Approval", () => {
    it("should approve step 1 and move to step 2, then approve step 2 to reach approved", () => {
      const actor = createActor(approvalMachine, { input: initialContext }).start()

      expect(actor.getSnapshot().value).toBe("pending")
      expect(actor.getSnapshot().context.currentStepIndex).toBe(0)

      actor.send({ type: "APPROVE_STEP", stepId: 1 })
      expect(actor.getSnapshot().value).toBe("step_2_pending")
      expect(actor.getSnapshot().context.stepApprovals[1]?.approved).toBe(true)

      actor.send({ type: "APPROVE_STEP", stepId: 2 })
      expect(actor.getSnapshot().value).toBe("approved")
      expect(actor.getSnapshot().context.stepApprovals[1]?.approved).toBe(true)
      expect(actor.getSnapshot().context.stepApprovals[2]?.approved).toBe(true)
    })
  })

  describe("Rejection at Step 2", () => {
    it("should reject when step 2 is rejected", () => {
      const actor = createActor(approvalMachine, { input: initialContext }).start()
      actor.send({ type: "APPROVE_STEP", stepId: 1 })
      actor.send({ type: "REJECT_STEP", stepId: 2, reason: "Budget too high" })

      const snap = actor.getSnapshot()
      expect(snap.value).toBe("rejected")
      expect(snap.context.stepApprovals[1]?.approved).toBe(true)
      expect(snap.context.stepApprovals[2]?.rejected).toBe(true)
      expect(snap.context.reason).toBe("Budget too high")
    })
  })

  describe("Parallel Approval Mode", () => {
    it("should reach approved after both steps approved in sequence with mode-annotated steps", () => {
      const actor = createActor(approvalMachine, {
        input: {
          steps: [
            { id: 1, stepNumber: 1, approvers: [{ id: "a1", name: "Approver A" }], mode: "any_one" },
            { id: 2, stepNumber: 2, approvers: [{ id: "a2", name: "Approver B" }], mode: "all_required" },
          ],
          stepApprovals: {},
          currentStepIndex: 0,
        },
      }).start()

      actor.send({ type: "APPROVE_STEP", stepId: 1 })
      actor.send({ type: "APPROVE_STEP", stepId: 2 })

      const snap = actor.getSnapshot()
      expect(snap.value).toBe("approved")
      expect(snap.context.stepApprovals[1]?.approved).toBe(true)
      expect(snap.context.stepApprovals[2]?.approved).toBe(true)
    })
  })

  describe("All-Required Mode", () => {
    it("should confirm all approvals recorded via checkCanTransitionToApproved", () => {
      const allApprovedContext: ApprovalContext = {
        steps: [
          { id: 1, stepNumber: 1, approvers: [{ id: "a1", name: "Approver A" }], mode: "all_required" },
          { id: 2, stepNumber: 2, approvers: [{ id: "a2", name: "Approver B" }], mode: "all_required" },
        ],
        stepApprovals: {
          1: { approved: true, rejected: false, skipped: false },
          2: { approved: true, rejected: false, skipped: false },
        },
        currentStepIndex: 2,
      }

      expect(checkCanTransitionToApproved(allApprovedContext.stepApprovals)).toBe(true)
    })

    it("should return false if any step is not approved", () => {
      const partialContext: ApprovalContext = {
        steps: [
          { id: 1, stepNumber: 1, approvers: [{ id: "a1", name: "Approver A" }], mode: "all_required" },
          { id: 2, stepNumber: 2, approvers: [{ id: "a2", name: "Approver B" }], mode: "all_required" },
        ],
        stepApprovals: {
          1: { approved: true, rejected: false, skipped: false },
          2: { approved: false, rejected: true, skipped: false },
        },
        currentStepIndex: 2,
      }

      expect(checkCanTransitionToApproved(partialContext.stepApprovals)).toBe(false)
    })
  })

  describe("Illegal Transitions - Cannot Bypass", () => {
    it("should not allow skipping from pending directly to approved — ends in skipped", () => {
      const actor = createActor(approvalMachine, { input: initialContext }).start()
      actor.send({ type: "SKIP_STEP", stepId: 1 })
      expect(actor.getSnapshot().value).toBe("skipped")
    })

    it("should not allow bypassing step 1 by sending step 2 approval — state stays pending", () => {
      const actor = createActor(approvalMachine, {
        input: {
          steps: [
            { id: 1, stepNumber: 1, approvers: [{ id: "a1", name: "Approver A" }], mode: "any_one" },
            { id: 2, stepNumber: 2, approvers: [{ id: "a2", name: "Approver B" }], mode: "any_one" },
          ],
          stepApprovals: {},
          currentStepIndex: 0,
        },
      }).start()

      actor.send({ type: "APPROVE_STEP", stepId: 2 })

      expect(actor.getSnapshot().value).toBe("pending")
      expect(actor.getSnapshot().context.stepApprovals[2]).toBeUndefined()
    })

    it("should not allow approving step 2 after step 1 was skipped — machine ends in skipped", () => {
      const actor = createActor(approvalMachine, {
        input: {
          steps: [
            { id: 1, stepNumber: 1, approvers: [{ id: "a1", name: "Approver A" }], mode: "any_one" },
            { id: 2, stepNumber: 2, approvers: [{ id: "a2", name: "Approver B" }], mode: "any_one" },
          ],
          stepApprovals: {},
          currentStepIndex: 0,
        },
      }).start()

      actor.send({ type: "SKIP_STEP", stepId: 1 })
      actor.send({ type: "APPROVE_STEP", stepId: 2 })

      expect(actor.getSnapshot().value).toBe("skipped")
      expect(actor.getSnapshot().context.stepApprovals[1]).toEqual({ approved: false, rejected: false, skipped: true })
      expect(actor.getSnapshot().context.stepApprovals[2]).toBeUndefined()
    })
  })

  describe("getApprovalStepState", () => {
    it("should return pending with all actions available when no approval recorded", () => {
      const result = getApprovalStepState(1, {})
      expect(result.stepState).toBe("pending")
      expect(result.canApprove).toBe(true)
      expect(result.canReject).toBe(true)
      expect(result.canSkip).toBe(true)
    })

    it("should return approved with no actions available", () => {
      const result = getApprovalStepState(1, { 1: { approved: true, rejected: false, skipped: false } })
      expect(result.stepState).toBe("approved")
      expect(result.canApprove).toBe(false)
      expect(result.canReject).toBe(false)
      expect(result.canSkip).toBe(false)
    })

    it("should return rejected with no actions available", () => {
      const result = getApprovalStepState(1, { 1: { approved: false, rejected: true, skipped: false } })
      expect(result.stepState).toBe("rejected")
      expect(result.canApprove).toBe(false)
      expect(result.canReject).toBe(false)
      expect(result.canSkip).toBe(false)
    })

    it("should return skipped with no actions available", () => {
      const result = getApprovalStepState(1, { 1: { approved: false, rejected: false, skipped: true } })
      expect(result.stepState).toBe("skipped")
      expect(result.canApprove).toBe(false)
      expect(result.canReject).toBe(false)
      expect(result.canSkip).toBe(false)
    })
  })

  describe("checkCanTransitionToApproved", () => {
    it("should return true when all steps are approved", () => {
      expect(
        checkCanTransitionToApproved({
          1: { approved: true, rejected: false, skipped: false },
          2: { approved: true, rejected: false, skipped: false },
          3: { approved: true, rejected: false, skipped: false },
        })
      ).toBe(true)
    })

    it("should return false when any step is not approved", () => {
      expect(
        checkCanTransitionToApproved({
          1: { approved: true, rejected: false, skipped: false },
          2: { approved: true, rejected: false, skipped: false },
          3: { approved: false, rejected: true, skipped: false },
        })
      ).toBe(false)
    })

    it("should return false when a step is skipped", () => {
      expect(
        checkCanTransitionToApproved({
          1: { approved: true, rejected: false, skipped: false },
          2: { approved: true, rejected: false, skipped: true },
        })
      ).toBe(false)
    })

    it("should return false when no steps exist", () => {
      expect(checkCanTransitionToApproved({})).toBe(false)
    })
  })

  describe("Step Machine", () => {
    it("should transition to approved on APPROVE_STEP", () => {
      const actor = createActor(stepMachine, { input: { stepId: 1, stepNumber: 1 } }).start()
      actor.send({ type: "APPROVE_STEP", stepId: 1 })
      expect(actor.getSnapshot().value).toBe("approved")
    })

    it("should transition to rejected on REJECT_STEP", () => {
      const actor = createActor(stepMachine, { input: { stepId: 1, stepNumber: 1 } }).start()
      actor.send({ type: "REJECT_STEP", stepId: 1, reason: "Test" })
      expect(actor.getSnapshot().value).toBe("rejected")
    })

    it("should transition to skipped on SKIP_STEP", () => {
      const actor = createActor(stepMachine, { input: { stepId: 1, stepNumber: 1 } }).start()
      actor.send({ type: "SKIP_STEP", stepId: 1 })
      expect(actor.getSnapshot().value).toBe("skipped")
    })
  })

  describe("initialContext export", () => {
    it("should have empty initial state", () => {
      expect(initialContext.steps).toEqual([])
      expect(initialContext.stepApprovals).toEqual({})
      expect(initialContext.currentStepIndex).toBe(0)
    })
  })
})
