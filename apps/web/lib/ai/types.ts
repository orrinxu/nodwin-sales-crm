export type AiProvider = "claude" | "gemini" | "kimi" | "deepseek" | "ollama_local"

export type AiFeature =
  | "search"
  | "summarise_deal"
  | "draft_email"
  | "next_best_action"
  | "other"

export type AiCallStatus =
  | "success"
  | "error"
  | "rate_limited"
  | "cap_rejected"
  | "fallback"

export interface UsageRecord {
  id: string
  userId: string
  provider: AiProvider
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  feature: AiFeature
  requestId: string
  startedAt: string
  finishedAt: string
  status: AiCallStatus
}

export interface InsertUsageParams {
  userId: string
  provider: AiProvider
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  feature: AiFeature
  requestId: string
  startedAt: Date
  finishedAt?: Date
  status?: AiCallStatus
}

export type CapScope = "user" | "team" | "company"

export interface CapCheckResult {
  allowed: boolean
  reason: string | null
  capScope: CapScope | null
  capLimit: number | null
  currentSpend: number | null
  suggestedAction: "proceed" | "degrade_to_ollama" | "reject"
}

export interface DailyCapConfig {
  softCapUsd: number | null
  hardCapUsd: number | null
}

export interface TeamDailyCap {
  teamId: string
  hardCapUsd: number | null
}

export interface CompanyDailyCap {
  entityId: string
  hardCapUsd: number | null
}

export interface UsageLogger {
  log(params: InsertUsageParams): Promise<UsageRecord>
}

export interface CapChecker {
  check(
    userId: string,
    estimatedCostUsd: number,
    context?: { teamId?: string; entityId?: string },
  ): Promise<CapCheckResult>
}

export interface DailyUsage {
  totalCostUsd: number
  totalPromptTokens: number
  totalCompletionTokens: number
  callCount: number
}

export interface AiCallParams {
  feature: AiFeature
  userId: string
  prompt: string
  systemPrompt?: string
  teamId?: string
  entityId?: string
  estimatedCostUsd: number
  estimatePromptTokens: number
  estimateCompletionTokens: number
  requestId: string
}

export interface AiCallResult {
  ok: boolean
  data?: string
  model?: string
  provider?: AiProvider
  reason?: string
}

export interface CapDataSource {
  getUserDailyUsage(userId: string): Promise<DailyUsage>
  getTeamDailyUsage(teamId: string): Promise<{ totalCostUsd: number }>
  getCompanyDailyUsage(entityId: string): Promise<{ totalCostUsd: number }>
  getUserCapOverrides(userId: string): Promise<{
    userSoftCapUsd: number | null
    userHardCapUsd: number | null
  }>
  getTeamHardCap(teamId: string): Promise<number | null>
  getCompanyHardCap(entityId: string): Promise<number | null>
  getUserTeamId(userId: string): Promise<string | null>
  getUserEntityId(userId: string): Promise<string | null>
}

export interface ProviderAdapter {
  call(prompt: string, systemPrompt?: string): Promise<{
    text: string
    model: string
    promptTokens: number
    completionTokens: number
  }>
}

export const DEFAULT_USER_SOFT_CAP_USD = 3
export const DEFAULT_USER_HARD_CAP_USD = 5
export const DEFAULT_TEAM_HARD_CAP_USD_PER_USER = 5
export const DEFAULT_COMPANY_HARD_CAP_USD = 500
