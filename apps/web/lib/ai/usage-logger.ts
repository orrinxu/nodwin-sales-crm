import type { UsageLogger, InsertUsageParams, UsageRecord } from "./types"
import { Money } from "../money"
import { createServerClient } from "../supabase/server"

function toDbInsert(p: InsertUsageParams): Record<string, unknown> {
  return {
    user_id: p.userId,
    provider: p.provider,
    model: p.model,
    prompt_tokens: p.promptTokens,
    completion_tokens: p.completionTokens,
    cost_amount: p.cost.toAmount(),
    cost_currency: p.cost.currency,
    feature: p.feature,
    request_id: p.requestId,
    started_at: p.startedAt.toISOString(),
    finished_at: (p.finishedAt ?? new Date()).toISOString(),
    status: p.status ?? "success",
  }
}

function fromDbRecord(r: Record<string, unknown>): UsageRecord {
  const costAmount = Number(r.cost_amount ?? 0)
  const costCurrency = (r.cost_currency as string) ?? "USD"
  return {
    id: r.id as string,
    userId: r.user_id as string,
    provider: r.provider as UsageRecord["provider"],
    model: r.model as string,
    promptTokens: r.prompt_tokens as number,
    completionTokens: r.completion_tokens as number,
    cost: Money.fromAmount(costAmount, costCurrency),
    feature: r.feature as UsageRecord["feature"],
    requestId: r.request_id as string,
    startedAt: r.started_at as string,
    finishedAt: r.finished_at as string,
    status: r.status as UsageRecord["status"],
  }
}

export function createUsageLogger(): UsageLogger {
  return {
    async log(params: InsertUsageParams): Promise<UsageRecord> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .from("ai_usage")
        .insert(toDbInsert(params))
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to log AI usage: ${error.message}`)
      }

      return fromDbRecord(data as Record<string, unknown>)
    },
  }
}
