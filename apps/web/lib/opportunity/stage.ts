export const DEAL_STAGES = [
  "qualify",
  "meet_and_present",
  "propose",
  "negotiate",
  "verbal_agreement",
  "closed_won",
  "closed_lost",
] as const

export type DealStage = (typeof DEAL_STAGES)[number]

export const STAGE_ORDER: Record<DealStage, number> = {
  qualify: 0,
  meet_and_present: 1,
  propose: 2,
  negotiate: 3,
  verbal_agreement: 4,
  closed_won: 5,
  closed_lost: 6,
}

export const TERMINAL_STAGES: DealStage[] = ["closed_won", "closed_lost"]

export const NON_TERMINAL_STAGES: DealStage[] = DEAL_STAGES.filter(
  (s): s is Exclude<DealStage, "closed_won" | "closed_lost"> =>
    !TERMINAL_STAGES.includes(s),
)

export type NonTerminalDealStage = (typeof NON_TERMINAL_STAGES)[number]

export type UserRole = "admin" | "group_sales_lead" | "sales_rep" | "viewer"

export interface StageTransitionResult {
  allowed: boolean
  reason?: string
}

export function isTerminalStage(stage: DealStage): boolean {
  return TERMINAL_STAGES.includes(stage)
}

export function getNextStage(stage: DealStage): DealStage | undefined {
  if (isTerminalStage(stage)) return undefined
  const index = DEAL_STAGES.indexOf(stage)
  return DEAL_STAGES.at(index + 1)
}

export function getPrevStage(stage: DealStage): DealStage | undefined {
  const index = DEAL_STAGES.indexOf(stage)
  return index > 0 ? DEAL_STAGES.at(index - 1) : undefined
}

/**
 * Validates whether a transition from `from` to `to` is allowed,
 * optionally scoped to a user role.
 *
 * Transition rules (mirrors the Postgres check_stage_transition trigger):
 * 1. Same stage → always allowed (no-op)
 * 2. Admin role → any transition allowed
 * 3. From terminal stage → only to non-terminal stages (REOPEN)
 * 4. To closed_lost → always allowed from non-terminal stages
 * 5. Forward (higher ordinal) → always allowed
 * 6. Backward by exactly 1 step → allowed
 * 7. Everything else → illegal
 */
export function checkStageTransition(
  from: DealStage,
  to: DealStage,
  userRole?: UserRole,
): StageTransitionResult {
  if (from === to) {
    return { allowed: true }
  }

  if (userRole === "admin") {
    return { allowed: true }
  }

  if (isTerminalStage(from)) {
    if (NON_TERMINAL_STAGES.includes(to as NonTerminalDealStage)) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: `Cannot transition from terminal stage '${from}' to '${to}' without admin override`,
    }
  }

  if (to === "closed_lost") {
    return { allowed: true }
  }

  const fromIdx = DEAL_STAGES.indexOf(from)
  const toIdx = DEAL_STAGES.indexOf(to)

  if (toIdx > fromIdx) {
    return { allowed: true }
  }

  if (toIdx === fromIdx - 1) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Illegal stage transition from '${from}' to '${to}'`,
  }
}

export interface StageTransitionDescriptor {
  from: DealStage
  to: DealStage
  event: string
  reason?: string
}

export function createTransitionDescriptor(
  from: DealStage,
  to: DealStage,
  event: string,
  reason?: string,
): StageTransitionDescriptor {
  return { from, to, event, reason }
}

export function assertStageTransition(
  from: DealStage,
  to: DealStage,
  userRole?: UserRole,
): void {
  const result = checkStageTransition(from, to, userRole)
  if (!result.allowed) {
    throw new Error(result.reason ?? "Illegal stage transition")
  }
}
