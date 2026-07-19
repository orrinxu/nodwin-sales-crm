import { Money } from "../money"

export type AiProvider = "claude" | "gemini" | "kimi" | "deepseek" | "ollama_local" | "openai_compatible"

export type AiFeature =
  | "search"
  | "summarise_deal"
  | "draft_email"
  | "next_best_action"
  | "opportunity_extraction"
  | "account_extraction"
  | "contact_extraction"
  | "transcription"
  | "embedding"
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
  cost: Money
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
  cost: Money
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
  capLimit: Money | null
  currentSpend: Money | null
  suggestedAction: "proceed" | "degrade_to_ollama" | "reject"
}

export interface DailyCapConfig {
  softCap: Money | null
  hardCap: Money | null
}

export interface TeamDailyCap {
  teamId: string
  hardCap: Money | null
}

export interface CompanyDailyCap {
  entityId: string
  hardCap: Money | null
}

export interface UsageLogger {
  log(params: InsertUsageParams): Promise<UsageRecord>
}

export interface CapChecker {
  check(
    userId: string,
    estimatedCost: Money,
    context?: { teamId?: string; entityId?: string },
  ): Promise<CapCheckResult>
}

export interface DailyUsage {
  cost: Money
  totalPromptTokens: number
  totalCompletionTokens: number
  callCount: number
}

/** A base64-encoded image passed to a vision-capable provider (ORR-686). */
export interface AiImageInput {
  /** MIME type, e.g. "image/png", "image/jpeg", "image/webp". */
  mimeType: string
  /** Base64-encoded bytes, WITHOUT a `data:` URI prefix. */
  dataBase64: string
}

/** Optional per-call adapter capabilities (ORR-686). Absent = text-only, as before. */
export interface AdapterCallOptions {
  /** Vision input. Providers that can't accept images ignore these. */
  images?: AiImageInput[]
  /** Ask the provider for native JSON output where it supports it. */
  json?: boolean
}

export interface AiCallParams {
  feature: AiFeature
  userId: string
  prompt: string
  systemPrompt?: string
  teamId?: string
  entityId?: string
  estimatedCost: Money
  estimatePromptTokens: number
  estimateCompletionTokens: number
  requestId: string
  /** ORR-686: vision input forwarded to the adapter. */
  images?: AiImageInput[]
  /** ORR-686: request native JSON output from the adapter. */
  json?: boolean
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
  getTeamDailyUsage(teamId: string): Promise<{ cost: Money }>
  getCompanyDailyUsage(entityId: string): Promise<{ cost: Money }>
  getUserCapOverrides(userId: string): Promise<{
    userSoftCap: Money | null
    userHardCap: Money | null
  }>
  getTeamHardCap(teamId: string): Promise<Money | null>
  getCompanyHardCap(entityId: string): Promise<Money | null>
  getUserTeamId(userId: string): Promise<string | null>
  getUserEntityId(userId: string): Promise<string | null>
}

export interface ProviderAdapter {
  call(prompt: string, systemPrompt?: string, options?: AdapterCallOptions): Promise<{
    text: string
    model: string
    promptTokens: number
    completionTokens: number
  }>
}

/**
 * Uniform per-provider config injected into an adapter factory. Any field left
 * undefined falls back to the provider's env var (ORR-635: DB ai_providers wins,
 * env is the fallback). `baseUrl` only applies to endpoint-based providers
 * (openai_compatible, ollama_local).
 */
export interface AdapterConfig {
  model?: string
  apiKey?: string
  baseUrl?: string
}

export const DEFAULT_USER_SOFT_CAP = Money.fromAmount(3, "USD")
export const DEFAULT_USER_HARD_CAP = Money.fromAmount(5, "USD")
export const DEFAULT_TEAM_HARD_CAP_PER_USER = Money.fromAmount(5, "USD")
export const DEFAULT_COMPANY_HARD_CAP = Money.fromAmount(500, "USD")
