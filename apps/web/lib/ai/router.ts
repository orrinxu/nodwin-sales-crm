import "server-only"
import type { AiCallParams, AiCallResult, ProviderAdapter, CapDataSource, UsageLogger, AiProvider } from "./types"
import { Money } from "../money"
import { CapEnforcer } from "./cap-enforcement"
import { createSupabaseCapDataSource } from "./supabase-cap-source"
import { createUsageLogger } from "./usage-logger"

export interface AiCallDeps {
  adapters: Map<string, ProviderAdapter>
  capSource?: CapDataSource
  usageLogger?: UsageLogger
}

function pickAdapters(
  _feature: string,
  adapters: Map<string, ProviderAdapter>,
  degradeToOllama: boolean,
): { provider: AiProvider; adapter: ProviderAdapter }[] {
  const chain: { provider: AiProvider; adapter: ProviderAdapter }[] = []

  if (degradeToOllama) {
    const ollama = adapters.get("ollama_local")
    if (ollama) {
      chain.push({ provider: "ollama_local", adapter: ollama })
    }
    return chain
  }

  // Map insertion order IS the fallback order — the DB-resolved chain (ORR-635)
  // inserts primary first, then priority; createAdaptersFromEnv inserts in its
  // own fixed order. The router honors whatever order it was handed.
  for (const [provider, adapter] of adapters) {
    chain.push({ provider: provider as AiProvider, adapter })
  }

  return chain
}

export async function aiCall(
  params: AiCallParams,
  deps: AiCallDeps,
): Promise<AiCallResult> {
  const startedAt = new Date()
  const capSource = deps.capSource ?? createSupabaseCapDataSource()
  const logger = deps.usageLogger ?? createUsageLogger()
  const enforcer = new CapEnforcer(capSource)

  const capResult = await enforcer.check(params.userId, params.estimatedCost)

  if (!capResult.allowed && capResult.suggestedAction === "reject") {
    try {
      await logger.log({
        userId: params.userId,
        provider: "ollama_local",
        model: "cap_rejected",
        promptTokens: 0,
        completionTokens: 0,
        cost: Money.zero("USD"),
        feature: params.feature,
        requestId: params.requestId,
        startedAt,
        finishedAt: new Date(),
        status: "cap_rejected",
      })
    } catch (e) {
      console.error("Failed to log cap_rejected:", e)
    }
    return { ok: false, reason: "service_unavailable" }
  }

  const degradeToOllama = capResult.suggestedAction === "degrade_to_ollama"
  const adapterChain = pickAdapters(params.feature, deps.adapters, degradeToOllama)

  if (adapterChain.length === 0) {
    try {
      await logger.log({
        userId: params.userId,
        provider: "ollama_local",
        model: "no_adapter",
        promptTokens: 0,
        completionTokens: 0,
        cost: Money.zero("USD"),
        feature: params.feature,
        requestId: params.requestId,
        startedAt,
        finishedAt: new Date(),
        status: "error",
      })
    } catch (e) {
      console.error("Failed to log no_adapter error:", e)
    }
    return { ok: false, reason: "provider_error" }
  }

  for (const { provider, adapter } of adapterChain) {
    try {
      const result = await adapter.call(params.prompt, params.systemPrompt)
      const finishedAt = new Date()

      await logger.log({
        userId: params.userId,
        provider,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        cost: params.estimatedCost,
        feature: params.feature,
        requestId: params.requestId,
        startedAt,
        finishedAt,
        status: degradeToOllama ? "fallback" : "success",
      })

      return { ok: true, data: result.text, model: result.model, provider }
    } catch (e) {
      console.error(`Provider ${provider} failed:`, e)
    }
  }

  try {
    await logger.log({
      userId: params.userId,
      provider: "ollama_local",
      model: "all_failed",
      promptTokens: 0,
      completionTokens: 0,
      cost: Money.zero("USD"),
      feature: params.feature,
      requestId: params.requestId,
      startedAt,
      finishedAt: new Date(),
      status: "error",
    })
  } catch (e) {
    console.error("Failed to log all_failed error:", e)
  }

  return { ok: false, reason: "provider_error" }
}
