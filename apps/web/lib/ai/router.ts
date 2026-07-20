import "server-only"
import type { AiCallParams, AiCallResult, ProviderAdapter, CapDataSource, UsageLogger, AiProvider, CapCheckResult } from "./types"
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

  // Soft-cap degrade: prefer the free local Ollama adapter when it is present.
  // But if ollama_local is NOT in the provided chain — e.g. self-hosted RAG
  // hands the router only openai_compatible, or a deployment doesn't run
  // Ollama — do NOT return an empty chain: that turns a soft-cap breach into a
  // total AI outage ("provider could not be reached"). Fall through to the
  // normal chain instead so self-hosted / already-cheap calls still complete
  // (ORR-807c). Zero-cost calls never reach here (exempted in aiCall).
  if (degradeToOllama) {
    const ollama = adapters.get("ollama_local")
    if (ollama) {
      chain.push({ provider: "ollama_local", adapter: ollama })
      return chain
    }
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

  // Fail CLOSED: if the cap check itself throws (e.g. the usage/caps query is
  // broken), deny rather than silently proceeding without hard-cap enforcement
  // — the exact moment the usage query is down is when unbounded spend is most
  // dangerous (ORR-807f). The cap source now surfaces genuine read errors.
  let capResult: CapCheckResult
  try {
    capResult = await enforcer.check(params.userId, params.estimatedCost)
  } catch (e) {
    console.error("AI cap enforcement failed — denying call (fail closed):", e)
    return { ok: false, reason: "service_unavailable" }
  }

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

  // Zero-cost calls (e.g. self-hosted RAG, which passes estimatedCost 0) must
  // never be degraded — degrading a $0 call saves nothing and only risks
  // breaking a chain that has no ollama_local adapter (ORR-807c).
  const degradeToOllama =
    capResult.suggestedAction === "degrade_to_ollama" && !params.estimatedCost.isZero()
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
    let result: Awaited<ReturnType<ProviderAdapter["call"]>>
    try {
      result = await adapter.call(params.prompt, params.systemPrompt, {
        images: params.images,
        json: params.json,
      })
    } catch (e) {
      console.error(`Provider ${provider} failed:`, e)
      // Record the failed attempt (own try/catch) so it isn't invisible to the
      // dashboard/debugging — tagged status "error" + a sentinel model, and
      // excluded from the per-provider cost aggregates by status (ORR-807d/e).
      try {
        await logger.log({
          userId: params.userId,
          provider,
          model: "provider_error",
          promptTokens: 0,
          completionTokens: 0,
          cost: Money.zero("USD"),
          feature: params.feature,
          requestId: params.requestId,
          startedAt,
          finishedAt: new Date(),
          status: "error",
        })
      } catch (logErr) {
        console.error(`Failed to log ${provider} failure:`, logErr)
      }
      continue
    }

    const finishedAt = new Date()

    // Log the SUCCESSFUL completion in its OWN try/catch — a usage-insert hiccup
    // must NEVER discard a good completion or fall through to the next provider
    // (double spend/latency, and possibly a "provider could not be reached" for
    // the user despite a good answer). We keep the completion regardless (ORR-807d).
    try {
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
    } catch (e) {
      console.error(`Failed to log usage for ${provider} (completion kept):`, e)
    }

    return { ok: true, data: result.text, model: result.model, provider }
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
