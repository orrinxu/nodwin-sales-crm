import { STAGE_ORDER, type DealStage } from "./stage"

/**
 * Line-items-requirement rule (ORR-753). A global admin setting names the stage
 * from which line items are expected; this is a WARNING, not a hard gate.
 */
export interface LineItemsRequirementConfig {
  /** Stage from which line items are expected, or null when the rule is off. */
  requiredFromStage: DealStage | null
  /** When true, a manually-overridden deal amount waives the requirement. */
  overrideExempts: boolean
}

/** Does the rule apply at this stage? A lost deal never needs a breakdown. */
export function lineItemsRequiredAtStage(
  stage: DealStage,
  config: LineItemsRequirementConfig,
): boolean {
  if (!config.requiredFromStage) return false
  if (stage === "closed_lost") return false
  // eslint-disable-next-line security/detect-object-injection -- keys are typed DealStage
  return STAGE_ORDER[stage] >= STAGE_ORDER[config.requiredFromStage]
}

/**
 * True when a deal has reached the required stage but has no line items (and
 * isn't waived by an override). The single source of truth for the warning.
 */
export function lineItemsRequirementUnmet(args: {
  stage: DealStage
  hasLineItems: boolean
  amountOverridden: boolean
  config: LineItemsRequirementConfig
}): boolean {
  const { stage, hasLineItems, amountOverridden, config } = args
  if (!lineItemsRequiredAtStage(stage, config)) return false
  if (hasLineItems) return false
  if (config.overrideExempts && amountOverridden) return false
  return true
}
