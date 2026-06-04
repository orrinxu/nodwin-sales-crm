import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { Money } from "@/lib/money"
import { DEAL_STAGES, type DealStage } from "@/lib/opportunity"

export interface ReportCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface PipelineStageSummary {
  stage: DealStage
  label: string
  count: number
  totalAmount: string
  currency: string
}

export interface PipelineSummary {
  stages: PipelineStageSummary[]
  totalCount: number
  totalAmount: string
  currency: string
}

const STAGE_LABELS: Record<DealStage, string> = {
  qualify: "Qualify",
  meet_and_present: "Meet & Present",
  propose: "Propose",
  negotiate: "Negotiate",
  verbal_agreement: "Verbal Agreement",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
}

export async function getPipelineSummary(
  ctx: ReportCallContext,
): Promise<PipelineSummary> {
  console.info("[reports] getPipelineSummary called by user", ctx.user.id)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency")

  if (error) {
    throw new Error(`Failed to load pipeline report data: ${error.message}`)
  }

  const defaultCurrency = "USD"

  const stageCounts = new Map<DealStage, number>()
  const stageAmounts = new Map<DealStage, { cents: number; currency: string }>()

  for (const stage of DEAL_STAGES) {
    stageCounts.set(stage, 0)
    stageAmounts.set(stage, { cents: 0, currency: defaultCurrency })
  }

  for (const row of data ?? []) {
    const stage = (row.stage as DealStage) ?? "qualify"
    const amountStr = row.amount != null ? String(row.amount) : "0"
    const currency = (row.currency as string) ?? defaultCurrency

    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1)

    if (currency === defaultCurrency) {
      const current = stageAmounts.get(stage)!
      const money = Money.fromAmount(amountStr, currency)
      current.cents += money.cents
    }
  }

  const stages: PipelineStageSummary[] = DEAL_STAGES.map((stage) => {
    const amount = stageAmounts.get(stage)!
    return {
      stage,
      // eslint-disable-next-line security/detect-object-injection -- stage is from DEAL_STAGES constant, not user input
      label: STAGE_LABELS[stage],
      count: stageCounts.get(stage) ?? 0,
      totalAmount: Money.fromCents(amount.cents, defaultCurrency).toAmount(),
      currency: defaultCurrency,
    }
  })

  const totalCount = stages.reduce((sum, s) => sum + s.count, 0)
  const totalCents = stages.reduce(
    (sum, s) => sum + Money.fromAmount(s.totalAmount, defaultCurrency).cents,
    0,
  )

  return {
    stages,
    totalCount,
    totalAmount: Money.fromCents(totalCents, defaultCurrency).toAmount(),
    currency: defaultCurrency,
  }
}
