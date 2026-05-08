import type {
  CapCheckResult,
  CapDataSource,
} from "./types"
import { Money } from "../money"
import { DEFAULT_USER_SOFT_CAP, DEFAULT_USER_HARD_CAP } from "./types"

export type { CapDataSource }

export class CapEnforcer {
  constructor(
    private dataSource: CapDataSource,
    private defaultUserSoftCap: Money = DEFAULT_USER_SOFT_CAP,
    private defaultUserHardCap: Money = DEFAULT_USER_HARD_CAP,
  ) {}

  async check(
    userId: string,
    estimatedCost: Money,
  ): Promise<CapCheckResult> {
    const today = await this.dataSource.getUserDailyUsage(userId)

    const userTeamId = await this.dataSource.getUserTeamId(userId)
    const userEntityId = await this.dataSource.getUserEntityId(userId)

    const caps = await this.dataSource.getUserCapOverrides(userId)

    const userSoftCap = caps.userSoftCap ?? this.defaultUserSoftCap
    const userHardCap = caps.userHardCap ?? this.defaultUserHardCap

    const teamHardCap = userTeamId
      ? await this.dataSource.getTeamHardCap(userTeamId)
      : null

    const companyHardCap = userEntityId
      ? await this.dataSource.getCompanyHardCap(userEntityId)
      : null

    const projectedUserSpend = today.cost.add(estimatedCost)

    let teamTodayCost = Money.zero("USD")
    if (teamHardCap !== null && userTeamId) {
      const teamUsage = await this.dataSource.getTeamDailyUsage(userTeamId)
      teamTodayCost = teamUsage.cost
    }

    let companyTodayCost = Money.zero("USD")
    if (companyHardCap !== null && userEntityId) {
      const companyUsage = await this.dataSource.getCompanyDailyUsage(userEntityId)
      companyTodayCost = companyUsage.cost
    }

    if (userHardCap !== null && projectedUserSpend.gt(userHardCap)) {
      return {
        allowed: false,
        reason: `Per-user daily hard cap of $${userHardCap.toAmount()} exceeded (current: $${today.cost.toAmount()}, estimated: $${estimatedCost.toAmount()})`,
        capScope: "user",
        capLimit: userHardCap,
        currentSpend: today.cost,
        suggestedAction: "reject",
      }
    }

    if (teamHardCap !== null && teamTodayCost.add(estimatedCost).gt(teamHardCap)) {
      return {
        allowed: false,
        reason: `Per-team daily hard cap of $${teamHardCap.toAmount()} exceeded (current: $${teamTodayCost.toAmount()}, estimated: $${estimatedCost.toAmount()})`,
        capScope: "team",
        capLimit: teamHardCap,
        currentSpend: teamTodayCost,
        suggestedAction: "reject",
      }
    }

    if (companyHardCap !== null && companyTodayCost.add(estimatedCost).gt(companyHardCap)) {
      return {
        allowed: false,
        reason: `Per-company daily hard cap of $${companyHardCap.toAmount()} exceeded (current: $${companyTodayCost.toAmount()}, estimated: $${estimatedCost.toAmount()})`,
        capScope: "company",
        capLimit: companyHardCap,
        currentSpend: companyTodayCost,
        suggestedAction: "reject",
      }
    }

    if (userSoftCap !== null && projectedUserSpend.gt(userSoftCap)) {
      return {
        allowed: true,
        reason: `Per-user daily soft cap of $${userSoftCap.toAmount()} exceeded (current: $${today.cost.toAmount()}, estimated: $${estimatedCost.toAmount()}) — degrading to Ollama`,
        capScope: "user",
        capLimit: userSoftCap,
        currentSpend: today.cost,
        suggestedAction: "degrade_to_ollama",
      }
    }

    return {
      allowed: true,
      reason: null,
      capScope: null,
      capLimit: null,
      currentSpend: today.cost,
      suggestedAction: "proceed",
    }
  }
}
