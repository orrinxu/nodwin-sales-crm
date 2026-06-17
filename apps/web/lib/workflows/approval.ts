import { createMachine, assign } from "xstate"

// ============================================================================
// Types
// ============================================================================

export type ApprovalStep = {
  id: number
  stepNumber: number
  approvers: { id: string; name: string }[]
  mode: "any_one" | "all_required"
}

export type ApproverVote = {
  approved: boolean
  rejected: boolean
}

export type StepApproval = {
  approved: boolean
  rejected: boolean
  skipped: boolean
  votes: Record<string, ApproverVote>
}

export type ApprovalContext = {
  steps: ApprovalStep[]
  stepApprovals: Record<number, StepApproval>
  currentStepIndex: number
  reason?: string
}

export type StepAction =
  | { type: "APPROVE_STEP"; stepId: number; approverId: string }
  | { type: "REJECT_STEP"; stepId: number; approverId: string; reason?: string }
  | { type: "SKIP_STEP"; stepId: number }

export const initialContext: ApprovalContext = {
  steps: [],
  stepApprovals: {},
  currentStepIndex: 0,
}

// ============================================================================
// Helpers
// ============================================================================

function findStep(context: ApprovalContext, stepId: number): ApprovalStep | undefined {
  return context.steps.find(s => s.id === stepId)
}

function isValidApprover(step: ApprovalStep | undefined, approverId: string): boolean {
  if (!step) return true
  return step.approvers.some(a => a.id === approverId)
}

function computeCanAdvance(step: ApprovalStep | undefined, stepApproval: StepApproval | undefined): boolean {
  if (!step) return true
  if (step.mode === "any_one") return true
  return step.approvers.every(a => stepApproval?.votes[a.id]?.approved)
}

function recordVote(
  stepApprovals: Record<number, StepApproval>,
  stepId: number,
  approverId: string,
  vote: ApproverVote,
): Record<number, StepApproval> {
  // eslint-disable-next-line security/detect-object-injection -- stepId is a typed numeric key
  const current = stepApprovals[stepId] ?? {
    approved: false,
    rejected: false,
    skipped: false,
    votes: {},
  }
  return {
    ...stepApprovals,
    [stepId]: {
      ...current,
      ...vote,
      votes: { ...current.votes, [approverId]: vote },
    },
  }
}

function approveVoteCanAdvance(
  context: ApprovalContext,
  event: StepAction & { type: "APPROVE_STEP" },
  stepId: number,
): boolean {
  if (event.stepId !== stepId) return false
  const step = findStep(context, stepId)
  if (!isValidApprover(step, event.approverId)) return false
  // eslint-disable-next-line security/detect-object-injection -- stepId is a typed numeric key
  const before = context.stepApprovals[stepId]
  const wouldBeStepApproval: StepApproval = {
    ...(before ?? { approved: false, rejected: false, skipped: false, votes: {} }),
    approved: true,
    votes: {
      ...(before?.votes ?? {}),
      [event.approverId]: { approved: true, rejected: false },
    },
  }
  return computeCanAdvance(step, wouldBeStepApproval)
}

function isApproverForStep(
  context: ApprovalContext,
  event: StepAction,
  stepId: number,
): boolean {
  if (event.type !== "APPROVE_STEP" && event.type !== "REJECT_STEP") return false
  if (event.stepId !== stepId) return false
  const step = findStep(context, stepId)
  return isValidApprover(step, event.approverId)
}

function isApproverCanStay(
  context: ApprovalContext,
  event: StepAction,
  stepId: number,
): boolean {
  if (event.type !== "APPROVE_STEP") return false
  if (event.stepId !== stepId) return false
  const step = findStep(context, stepId)
  if (!isValidApprover(step, event.approverId)) return false
  // eslint-disable-next-line security/detect-object-injection -- stepId is a typed numeric key
  const stepApproval = context.stepApprovals[stepId]
  return !computeCanAdvance(step, stepApproval)
}

// ============================================================================
// Step Machine
// Tracks per-step state: pending → approved | rejected | skipped
// ============================================================================

export const stepMachine = createMachine({
  id: "step",
  initial: "pending",
  context: ({ input }: { input?: { stepId?: number; stepNumber?: number } }) => ({
    stepId: input?.stepId ?? 0,
    stepNumber: input?.stepNumber ?? 0,
  }),
  types: {} as { events: StepAction; input: { stepId?: number; stepNumber?: number } },
  states: {
    pending: {
      on: {
        APPROVE_STEP: "approved",
        REJECT_STEP: "rejected",
        SKIP_STEP: "skipped",
      },
    },
    approved: { type: "final" },
    rejected: { type: "final" },
    skipped: { type: "final" },
  },
})

// ============================================================================
// Approval Machine
// Flow: step_1_pending → step_2_pending → approved | rejected | skipped
//
// Guards enforce:
//   - Sequential ordering (out-of-order stepId events are ignored)
//   - Approver membership (only step.approvers may vote)
//   - Mode-based aggregation:
//       any_one      — first valid approve vote advances
//       all_required — step advances only when every approver has approved
// ============================================================================

export const approvalMachine = createMachine({
  id: "approval",
  initial: "step_1_pending",
  context: ({ input }: { input?: Partial<ApprovalContext> }) => ({
    ...initialContext,
    ...input,
  }),
  types: {} as {
    context: ApprovalContext
    events: StepAction
    input: Partial<ApprovalContext>
  },
  states: {
    step_1_pending: {
      on: {
        APPROVE_STEP: [
          {
            guard: ({ context, event }) => approveVoteCanAdvance(context, event, 1),
            target: "step_2_pending",
            actions: assign({
              currentStepIndex: 1,
              stepApprovals: ({ context, event }) =>
                recordVote(context.stepApprovals, event.stepId, event.approverId, {
                  approved: true,
                  rejected: false,
                }),
            }),
          },
          {
            guard: ({ context, event }) =>
              isApproverCanStay(context, event, 1),
            actions: assign({
              stepApprovals: ({ context, event }) =>
                recordVote(context.stepApprovals, event.stepId, event.approverId, {
                  approved: true,
                  rejected: false,
                }),
            }),
          },
        ],
        REJECT_STEP: {
          guard: ({ context, event }) => isApproverForStep(context, event, 1),
          target: "rejected",
          actions: assign({
            reason: ({ event }) => (event as { reason?: string }).reason,
            stepApprovals: ({ context, event }) =>
              recordVote(context.stepApprovals, event.stepId, event.approverId, {
                approved: false,
                rejected: true,
              }),
          }),
        },
        SKIP_STEP: {
          guard: ({ event }) => event.stepId === 1,
          target: "skipped",
          actions: assign({
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: {
                approved: false,
                rejected: false,
                skipped: true,
                votes: {},
              },
            }),
          }),
        },
      },
    },
    step_2_pending: {
      entry: assign({ currentStepIndex: 2 }),
      on: {
        APPROVE_STEP: [
          {
            guard: ({ context, event }) => approveVoteCanAdvance(context, event, 2),
            target: "approved",
            actions: assign({
              stepApprovals: ({ context, event }) =>
                recordVote(context.stepApprovals, event.stepId, event.approverId, {
                  approved: true,
                  rejected: false,
                }),
            }),
          },
          {
            guard: ({ context, event }) =>
              isApproverCanStay(context, event, 2),
            actions: assign({
              stepApprovals: ({ context, event }) =>
                recordVote(context.stepApprovals, event.stepId, event.approverId, {
                  approved: true,
                  rejected: false,
                }),
            }),
          },
        ],
        REJECT_STEP: {
          guard: ({ context, event }) => isApproverForStep(context, event, 2),
          target: "rejected",
          actions: assign({
            reason: ({ event }) => (event as { reason?: string }).reason,
            stepApprovals: ({ context, event }) =>
              recordVote(context.stepApprovals, event.stepId, event.approverId, {
                approved: false,
                rejected: true,
              }),
          }),
        },
        SKIP_STEP: {
          guard: ({ event }) => event.stepId === 2,
          target: "skipped",
          actions: assign({
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: {
                approved: false,
                rejected: false,
                skipped: true,
                votes: {},
              },
            }),
          }),
        },
      },
    },
    approved: { type: "final" },
    rejected: { type: "final" },
    skipped: { type: "final" },
  },
})

// ============================================================================
// Helpers
// ============================================================================

export function getApprovalStepState(
  stepIndex: number,
  stepApprovals: Record<number, StepApproval>,
): {
  stepState: "pending" | "approved" | "rejected" | "skipped"
  canApprove: boolean
  canReject: boolean
  canSkip: boolean
} {
  // eslint-disable-next-line security/detect-object-injection -- stepIndex is a number, not user input
  const s = stepApprovals[stepIndex]
  const stepState: "pending" | "approved" | "rejected" | "skipped" = !s
    ? "pending"
    : s.approved
      ? "approved"
      : s.rejected
        ? "rejected"
        : s.skipped
          ? "skipped"
          : "pending"

  const isTerminal = stepState !== "pending"
  return { stepState, canApprove: !isTerminal, canReject: !isTerminal, canSkip: !isTerminal }
}

export function checkCanTransitionToApproved(
  stepApprovals: Record<number, StepApproval>,
): boolean {
  const entries = Object.values(stepApprovals)
  return entries.length > 0 && entries.every(s => s.approved && !s.skipped && !s.rejected)
}
