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

export type StepApproval = {
  approved: boolean
  rejected: boolean
  skipped: boolean
}

export type ApprovalContext = {
  steps: ApprovalStep[]
  stepApprovals: Record<number, StepApproval>
  currentStepIndex: number
  reason?: string
}

export type StepAction =
  | { type: "APPROVE_STEP"; stepId: number }
  | { type: "REJECT_STEP"; stepId: number; reason?: string }
  | { type: "SKIP_STEP"; stepId: number }

export const initialContext: ApprovalContext = {
  steps: [],
  stepApprovals: {},
  currentStepIndex: 0,
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
// Flow: pending (step 1) → step_2_pending → approved | rejected | skipped
//
// Guards on stepId enforce sequential ordering — out-of-order events are ignored
// and the state does not change, preventing bypass of required steps.
// ============================================================================

export const approvalMachine = createMachine({
  id: "approval",
  initial: "pending",
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
    // Represents step_1_pending — the initial state awaiting the first step action
    pending: {
      on: {
        APPROVE_STEP: {
          guard: ({ event }) => event.stepId === 1,
          target: "step_2_pending",
          actions: assign({
            currentStepIndex: 1,
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: { approved: true, rejected: false, skipped: false },
            }),
          }),
        },
        REJECT_STEP: {
          guard: ({ event }) => event.stepId === 1,
          target: "rejected",
          actions: assign({
            reason: ({ event }) => event.reason,
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: { approved: false, rejected: true, skipped: false },
            }),
          }),
        },
        SKIP_STEP: {
          guard: ({ event }) => event.stepId === 1,
          target: "skipped",
          actions: assign({
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: { approved: false, rejected: false, skipped: true },
            }),
          }),
        },
      },
    },
    step_2_pending: {
      entry: assign({ currentStepIndex: 2 }),
      on: {
        APPROVE_STEP: {
          guard: ({ event }) => event.stepId === 2,
          target: "approved",
          actions: assign({
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: { approved: true, rejected: false, skipped: false },
            }),
          }),
        },
        REJECT_STEP: {
          guard: ({ event }) => event.stepId === 2,
          target: "rejected",
          actions: assign({
            reason: ({ event }) => event.reason,
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: { approved: false, rejected: true, skipped: false },
            }),
          }),
        },
        SKIP_STEP: {
          guard: ({ event }) => event.stepId === 2,
          target: "skipped",
          actions: assign({
            stepApprovals: ({ context, event }) => ({
              ...context.stepApprovals,
              [event.stepId]: { approved: false, rejected: false, skipped: true },
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
  stepApprovals: Record<number, StepApproval>
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
  stepApprovals: Record<number, StepApproval>
): boolean {
  const entries = Object.values(stepApprovals)
  return entries.length > 0 && entries.every(s => s.approved && !s.skipped && !s.rejected)
}
