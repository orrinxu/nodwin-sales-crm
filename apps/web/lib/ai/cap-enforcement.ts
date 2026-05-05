import type {
  CapCheckResult,
  CapDataSource,
} from "./types"

export type { CapDataSource }

export class CapEnforcer {
  constructor(
    private dataSource: CapDataSource,
    private defaultUserSoftCapUsd = 3,
    private defaultUserHardCapUsd = 5,
  ) {}

  async check(
    userId: string,
    estimatedCostUsd: number,
  ): Promise<CapCheckResult> {
    const today = await this.dataSource.getUserDailyUsage(userId)

    const userTeamId = await this.dataSource.getUserTeamId(userId)
    const userEntityId = await this.dataSource.getUserEntityId(userId)

    const caps = await this.dataSource.getUserCapOverrides(userId)

    const userSoftCap = caps.userSoftCapUsd ?? this.defaultUserSoftCapUsd
    const userHardCap = caps.userHardCapUsd ?? this.defaultUserHardCapUsd

    const teamHardCap = userTeamId
      ? await this.dataSource.getTeamHardCap(userTeamId)
      : null

    const companyHardCap = userEntityId
      ? await this.dataSource.getCompanyHardCap(userEntityId)
      : null

    const projectedUserSpend = today.totalCostUsd + estimatedCostUsd

    let teamTodayCost = 0
    if (teamHardCap !== null && userTeamId) {
      const teamUsage = await this.dataSource.getTeamDailyUsage(userTeamId)
      teamTodayCost = teamUsage.totalCostUsd
    }

    let companyTodayCost = 0
    if (companyHardCap !== null && userEntityId) {
      const companyUsage = await this.dataSource.getCompanyDailyUsage(userEntityId)
      companyTodayCost = companyUsage.totalCostUsd
    }

    if (userHardCap !== null && projectedUserSpend > userHardCap) {
      return {
        allowed: false,
        reason: `Per-user daily hard cap of $${userHardCap} exceeded (current: $${today.totalCostUsd}, estimated: $${estimatedCostUsd})`,
        capScope: "user",
        capLimit: userHardCap,
        currentSpend: today.totalCostUsd,
        suggestedAction: "reject",
      }
    }

    if (teamHardCap !== null && Number(teamTodayCost) + Number(estimatedCostUsd) > teamHardCap) {
      return {
        allowed: false,
        reason: `Per-team daily hard cap of $${teamHardCap} exceeded (current: $${teamTodayCost}, estimated: $${estimatedCostUsd})`,
        capScope: "team",
        capLimit: teamHardCap,
        currentSpend: teamTodayCost,
        suggestedAction: "reject",
      }
    }

    if (companyHardCap !== null && Number(companyTodayCost) + Number(estimatedCostUsd) > companyHardCap) {
      return {
        allowed: false,
        reason: `Per-company daily hard cap of $${companyHardCap} exceeded (current: $${companyTodayCost}, estimated: $${estimatedCostUsd})`,
        capScope: "company",
        capLimit: companyHardCap,
        currentSpend: companyTodayCost,
        suggestedAction: "reject",
      }
    }

    if (userSoftCap !== null && projectedUserSpend > userSoftCap) {
      return {
        allowed: true,
        reason: `Per-user daily soft cap of $${userSoftCap} exceeded (current: $${today.totalCostUsd}, estimated: $${estimatedCostUsd}) — degrading to Ollama`,
        capScope: "user",
        capLimit: userSoftCap,
        currentSpend: today.totalCostUsd,
        suggestedAction: "degrade_to_ollama",
      }
    }

    return {
      allowed: true,
      reason: null,
      capScope: null,
      capLimit: null,
      currentSpend: today.totalCostUsd,
      suggestedAction: "proceed",
    }
  }
}
