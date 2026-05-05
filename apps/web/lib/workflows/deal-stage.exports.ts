export {
  DEAL_STAGES,
  STAGE_ORDER,
  TERMINAL_STAGES,
  NON_TERMINAL_STAGES,
  isTerminalStage,
  getNextStage,
  getPrevStage,
  dealStageMachine,
} from "./deal-stage"

export type {
  DealStage,
  NonTerminalDealStage,
  StageHistoryEntry,
  DealStageContext,
  DealStageEvents,
  DealStageActor,
} from "./deal-stage"
