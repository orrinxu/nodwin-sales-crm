import "server-only"
import type { Money } from "../money"
import { CapEnforcer } from "./cap-enforcement"
import { createSupabaseCapDataSource } from "./supabase-cap-source"
import { createUsageLogger } from "./usage-logger"
import type { AiFeature, AiProvider, AiCallStatus, CapDataSource, UsageLogger } from "./types"

// ORR-808 (f): metering seam for AI paths that DON'T go through the text-chat
// `aiCall` router — voice transcription (Whisper) and embedding calls. Those were
// invisible to the usage dashboard and uncapped. This gives them the same two
// controls aiCall applies: a cap pre-check and an ai_usage log row.
//
// Both helpers are BEST-EFFORT on infrastructure errors: a metering hiccup must
// never break a legitimate call (the cap check fails OPEN, the log is swallowed).
// A cap check that DEFINITIVELY computes over-budget still returns true — that's
// an enforcement decision, not an infra error.

export interface MeterDeps {
  capSource?: CapDataSource
  usageLogger?: UsageLogger
}

/** True when this user's projected spend would breach a hard cap and the call
 *  must be rejected. Fails open (returns false) if the cap infra itself errors. */
export async function isOverCap(userId: string, estimatedCost: Money, deps: MeterDeps = {}): Promise<boolean> {
  try {
    const enforcer = new CapEnforcer(deps.capSource ?? createSupabaseCapDataSource())
    const res = await enforcer.check(userId, estimatedCost)
    return !res.allowed && res.suggestedAction === "reject"
  } catch (e) {
    console.warn("[meter] cap check failed — proceeding without enforcement:", e)
    return false
  }
}

export interface LogAiUsageParams {
  userId: string
  feature: AiFeature
  provider: AiProvider
  model: string
  cost: Money
  requestId: string
  startedAt: Date
  status?: AiCallStatus
  promptTokens?: number
  completionTokens?: number
}

/** Write an ai_usage row for a non-aiCall AI path. Best-effort — a logging
 *  failure is warned and swallowed, never surfaced to the user. */
export async function logAiUsage(params: LogAiUsageParams, deps: MeterDeps = {}): Promise<void> {
  try {
    const logger = deps.usageLogger ?? createUsageLogger()
    await logger.log({
      userId: params.userId,
      provider: params.provider,
      model: params.model,
      promptTokens: params.promptTokens ?? 0,
      completionTokens: params.completionTokens ?? 0,
      cost: params.cost,
      feature: params.feature,
      requestId: params.requestId,
      startedAt: params.startedAt,
      finishedAt: new Date(),
      status: params.status ?? "success",
    })
  } catch (e) {
    console.warn("[meter] usage log failed:", e)
  }
}
