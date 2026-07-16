export {
  DEAL_STAGES,
  STAGE_ORDER,
  TERMINAL_STAGES,
  NON_TERMINAL_STAGES,
  isTerminalStage,
  getNextStage,
  getPrevStage,
  checkStageTransition,
  assertStageTransition,
  createTransitionDescriptor,
} from "./stage"

export {
  lineItemsRequiredAtStage,
  lineItemsRequirementUnmet,
} from "./line-items-requirement"

export type { LineItemsRequirementConfig } from "./line-items-requirement"

export type {
  DealStage,
  NonTerminalDealStage,
  UserRole,
  StageTransitionResult,
  StageTransitionDescriptor,
} from "./stage"
