import { setup, assign, type ActorRefFrom } from "xstate"

// `lib/opportunity/stage.ts` is the single source of truth for the DealStage
// domain model (stage list, ordering, terminal helpers). This module owns only
// the xstate workflow machine and re-exports the domain pieces so existing
// importers of `./deal-stage` keep working without a second, drifting copy.
import {
  DEAL_STAGES,
  STAGE_ORDER,
  TERMINAL_STAGES,
  NON_TERMINAL_STAGES,
  isTerminalStage,
  getNextStage,
  getPrevStage,
  type DealStage,
  type NonTerminalDealStage,
} from "@/lib/opportunity/stage"

export {
  DEAL_STAGES,
  STAGE_ORDER,
  TERMINAL_STAGES,
  NON_TERMINAL_STAGES,
  isTerminalStage,
  getNextStage,
  getPrevStage,
}

export type { DealStage, NonTerminalDealStage }

export interface StageHistoryEntry {
  from: DealStage
  to: DealStage
  event: string
  timestamp: string
  reason?: string
}

export interface DealStageContext {
  currentStage: DealStage
  stageHistory: StageHistoryEntry[]
}

export type DealStageEvents =
  | { type: "ADVANCE" }
  | { type: "MOVE_BACKWARD" }
  | { type: "CLOSE_WON" }
  | { type: "CLOSE_LOST" }
  | { type: "REOPEN"; stage: NonTerminalDealStage; reason: string }
  | { type: "FORCE_STAGE"; stage: DealStage; reason: string }

function createHistoryEntry(
  from: DealStage,
  to: DealStage,
  event: string,
  reason?: string,
): StageHistoryEntry {
  return {
    from,
    to,
    event,
    timestamp: new Date().toISOString(),
    ...(reason !== undefined ? { reason } : {}),
  }
}

export const dealStageMachine = setup({
  types: {} as {
    context: DealStageContext
    events: DealStageEvents
  },
  actions: {
    recordAdvance: assign(({ context }) => {
      const to = getNextStage(context.currentStage)
      if (!to) return {}
      return {
        currentStage: to,
        stageHistory: [
          ...context.stageHistory,
          createHistoryEntry(context.currentStage, to, "ADVANCE"),
        ],
      }
    }),
    recordBackward: assign(({ context }) => {
      const to = getPrevStage(context.currentStage)
      if (!to) return {}
      return {
        currentStage: to,
        stageHistory: [
          ...context.stageHistory,
          createHistoryEntry(context.currentStage, to, "MOVE_BACKWARD"),
        ],
      }
    }),
    recordCloseWon: assign(({ context }) => ({
      currentStage: "closed_won" as DealStage,
      stageHistory: [
        ...context.stageHistory,
        createHistoryEntry(context.currentStage, "closed_won", "CLOSE_WON"),
      ],
    })),
    recordCloseLost: assign(({ context }) => ({
      currentStage: "closed_lost" as DealStage,
      stageHistory: [
        ...context.stageHistory,
        createHistoryEntry(context.currentStage, "closed_lost", "CLOSE_LOST"),
      ],
    })),
    recordReopen: assign(({ context, event }) => {
      const reopenEvent = event as { type: "REOPEN"; stage: NonTerminalDealStage; reason: string }
      return {
        currentStage: reopenEvent.stage,
        stageHistory: [
          ...context.stageHistory,
          createHistoryEntry(
            context.currentStage,
            reopenEvent.stage,
            "REOPEN",
            reopenEvent.reason,
          ),
        ],
      }
    }),
    recordForceStage: assign(({ context, event }) => {
      const forceEvent = event as { type: "FORCE_STAGE"; stage: DealStage; reason: string }
      return {
        currentStage: forceEvent.stage,
        stageHistory: [
          ...context.stageHistory,
          createHistoryEntry(
            context.currentStage,
            forceEvent.stage,
            "FORCE_STAGE",
            forceEvent.reason,
          ),
        ],
      }
    }),
  },
}).createMachine({
  initial: "qualify",
  context: {
    currentStage: "qualify",
    stageHistory: [],
  },
  states: {
    qualify: {
      on: {
        ADVANCE: { target: "meet_and_present", actions: "recordAdvance" },
        CLOSE_WON: { target: "closed_won", actions: "recordCloseWon" },
        CLOSE_LOST: { target: "closed_lost", actions: "recordCloseLost" },
        FORCE_STAGE: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordForceStage" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordForceStage" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordForceStage" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordForceStage" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordForceStage" },
          { target: "closed_won", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_won", actions: "recordForceStage" },
          { target: "closed_lost", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_lost", actions: "recordForceStage" },
        ],
      },
    },
    meet_and_present: {
      on: {
        ADVANCE: { target: "propose", actions: "recordAdvance" },
        MOVE_BACKWARD: { target: "qualify", actions: "recordBackward" },
        CLOSE_WON: { target: "closed_won", actions: "recordCloseWon" },
        CLOSE_LOST: { target: "closed_lost", actions: "recordCloseLost" },
        FORCE_STAGE: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordForceStage" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordForceStage" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordForceStage" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordForceStage" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordForceStage" },
          { target: "closed_won", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_won", actions: "recordForceStage" },
          { target: "closed_lost", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_lost", actions: "recordForceStage" },
        ],
      },
    },
    propose: {
      on: {
        ADVANCE: { target: "negotiate", actions: "recordAdvance" },
        MOVE_BACKWARD: { target: "meet_and_present", actions: "recordBackward" },
        CLOSE_WON: { target: "closed_won", actions: "recordCloseWon" },
        CLOSE_LOST: { target: "closed_lost", actions: "recordCloseLost" },
        FORCE_STAGE: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordForceStage" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordForceStage" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordForceStage" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordForceStage" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordForceStage" },
          { target: "closed_won", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_won", actions: "recordForceStage" },
          { target: "closed_lost", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_lost", actions: "recordForceStage" },
        ],
      },
    },
    negotiate: {
      on: {
        ADVANCE: { target: "verbal_agreement", actions: "recordAdvance" },
        MOVE_BACKWARD: { target: "propose", actions: "recordBackward" },
        CLOSE_WON: { target: "closed_won", actions: "recordCloseWon" },
        CLOSE_LOST: { target: "closed_lost", actions: "recordCloseLost" },
        FORCE_STAGE: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordForceStage" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordForceStage" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordForceStage" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordForceStage" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordForceStage" },
          { target: "closed_won", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_won", actions: "recordForceStage" },
          { target: "closed_lost", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_lost", actions: "recordForceStage" },
        ],
      },
    },
    verbal_agreement: {
      on: {
        ADVANCE: { target: "closed_won", actions: "recordAdvance" },
        MOVE_BACKWARD: { target: "negotiate", actions: "recordBackward" },
        CLOSE_WON: { target: "closed_won", actions: "recordCloseWon" },
        CLOSE_LOST: { target: "closed_lost", actions: "recordCloseLost" },
        FORCE_STAGE: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordForceStage" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordForceStage" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordForceStage" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordForceStage" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordForceStage" },
          { target: "closed_won", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_won", actions: "recordForceStage" },
          { target: "closed_lost", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_lost", actions: "recordForceStage" },
        ],
      },
    },
    closed_won: {
      on: {
        REOPEN: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordReopen" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordReopen" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordReopen" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordReopen" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordReopen" },
        ],
        FORCE_STAGE: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordForceStage" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordForceStage" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordForceStage" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordForceStage" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordForceStage" },
          { target: "closed_won", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_won", actions: "recordForceStage" },
          { target: "closed_lost", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_lost", actions: "recordForceStage" },
        ],
      },
    },
    closed_lost: {
      on: {
        REOPEN: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordReopen" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordReopen" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordReopen" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordReopen" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordReopen" },
        ],
        FORCE_STAGE: [
          { target: "qualify", guard: ({ event }) => (event as { stage: DealStage }).stage === "qualify", actions: "recordForceStage" },
          { target: "meet_and_present", guard: ({ event }) => (event as { stage: DealStage }).stage === "meet_and_present", actions: "recordForceStage" },
          { target: "propose", guard: ({ event }) => (event as { stage: DealStage }).stage === "propose", actions: "recordForceStage" },
          { target: "negotiate", guard: ({ event }) => (event as { stage: DealStage }).stage === "negotiate", actions: "recordForceStage" },
          { target: "verbal_agreement", guard: ({ event }) => (event as { stage: DealStage }).stage === "verbal_agreement", actions: "recordForceStage" },
          { target: "closed_won", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_won", actions: "recordForceStage" },
          { target: "closed_lost", guard: ({ event }) => (event as { stage: DealStage }).stage === "closed_lost", actions: "recordForceStage" },
        ],
      },
    },
  },
})

export type DealStageActor = ActorRefFrom<typeof dealStageMachine>
