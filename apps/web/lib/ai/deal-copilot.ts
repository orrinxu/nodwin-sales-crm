import "server-only"
import { randomUUID } from "node:crypto"
import { aiCall } from "./router"
import { createProviderAdapters } from "./provider-chain"
import { resolveProviderChain } from "../data/ai-providers"
import { Money } from "../money"
import type { AiFeature, ProviderAdapter } from "./types"
import type { ProviderName } from "./providers"
import type { OpportunityRecord } from "../data/opportunities.types"
import { getStageLabel } from "../data/opportunities.types"
import type { ActivityRecord } from "../data/activities"

// AI Deal Copilot — three grounded, single-shot assists on the opportunity detail
// page: a status summary, a follow-up email draft, and next-best-action suggestions.
//
// This routes through the SAME general AI seam as everything else (aiCall +
// createProviderAdapters), so the daily cap enforcement (ai_daily_caps) and usage
// logging (ai_usage) apply automatically. Each action carries a distinct `feature`
// tag so spend is attributable. v1 is grounded ONLY in the opportunity fields +
// its recent activities; RAG grounding over indexed documents is a follow-up.

export type CopilotAction = "summary" | "email" | "next_best_action"

/** Shown when no AI provider is configured (neither admin settings nor env). */
export const COPILOT_UNCONFIGURED_MESSAGE =
  "AI is not configured. Configure an AI provider under Admin → AI."

// No per-token pricing table exists in the codebase yet, so we cannot compute an
// exact cost per model. We pass a small, conservative flat estimate so the cap
// enforcer still gates on it and usage is logged with a non-zero, attributable
// cost. Replacing this with a real per-provider price is a follow-up.
export const COPILOT_ESTIMATED_COST = Money.fromAmount("0.02", "USD")
const COPILOT_COMPLETION_TOKEN_BUDGET = 600
const MAX_ACTIVITIES = 8
const MAX_ACTIVITY_BODY_CHARS = 600

function featureFor(action: CopilotAction): AiFeature {
  switch (action) {
    case "summary":
      return "summarise_deal"
    case "email":
      return "draft_email"
    case "next_best_action":
      return "next_best_action"
  }
}

/** Rough token estimate (~4 chars/token) for logging/cap inputs only. */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4)
}

// Injection-aware, anti-hallucination system prompt. The deal context is the ONLY
// source of truth; the model must not invent names, amounts, dates or commitments.
export const COPILOT_SYSTEM_PROMPT = [
  "You are a sales Deal Copilot embedded in NODWIN's CRM. You assist the deal owner with a status summary, a follow-up email, or next best actions for ONE opportunity.",
  "",
  "Rules — follow them exactly:",
  "1. Use ONLY the deal context provided in the user message. Do NOT use outside or prior knowledge about this company, deal, people, prices or dates.",
  "2. Never fabricate facts. Do not invent names, contacts, companies, amounts, dates, or commitments that are not present in the context. If a needed detail is missing, say it is not recorded, or use an obvious placeholder such as [contact name] — never a made-up value.",
  "3. Be concise, specific to THIS deal, and free of filler.",
  "4. Output plain text only. No markdown headings and no code fences.",
].join("\n")

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "not set"
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime())
    ? "not set"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function fmtAmount(opp: OpportunityRecord): string {
  try {
    return Money.fromAmount(opp.amount, opp.currency).toDisplay()
  } catch {
    return `${opp.amount} ${opp.currency}`
  }
}

/** A compact, human-readable dump of the known deal fields. Only non-empty facts. */
export function buildDealContext(opp: OpportunityRecord, activities: ActivityRecord[]): string {
  const lines: string[] = []
  const push = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return
    if (Array.isArray(value) && value.length === 0) return
    lines.push(`- ${label}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
  }

  push("Opportunity name", opp.name)
  push("Account", opp.accountName)
  push("Stage", getStageLabel(opp.stage))
  push("Amount", fmtAmount(opp))
  push("Win probability", `${opp.probabilityPct}%`)
  push("Close date", opp.closeDate ? fmtDate(opp.closeDate) : null)
  push("Owner", opp.ownerName)
  push("Service type", opp.serviceType)
  push("Property type", opp.propertyType)
  push("Country of execution", opp.countryExecution)
  push("Recurring", opp.recurring ? "Yes" : null)
  push(
    "Estimated gross margin",
    opp.estimatedGrossMarginPct != null ? `${opp.estimatedGrossMarginPct}%` : null,
  )
  if (opp.servicePeriodStart || opp.servicePeriodEnd) {
    push("Service period", `${fmtDate(opp.servicePeriodStart)} to ${fmtDate(opp.servicePeriodEnd)}`)
  }
  push("Loss reason", opp.lossReason)
  push("Description", opp.description)

  const recent = activities.slice(0, MAX_ACTIVITIES)
  let activityBlock: string
  if (recent.length === 0) {
    activityBlock = "No activities have been logged on this deal yet."
  } else {
    activityBlock = recent
      .map((a) => {
        const when = fmtDate(a.createdAt)
        const who = a.userName ? ` by ${a.userName}` : ""
        const subject = a.subject ? ` — ${a.subject}` : ""
        const body = a.body ? `\n  ${a.body.slice(0, MAX_ACTIVITY_BODY_CHARS).replace(/\s+/g, " ").trim()}` : ""
        return `- [${when}] ${a.type}${who}${subject}${body}`
      })
      .join("\n")
  }

  return [
    "DEAL FIELDS:",
    lines.join("\n"),
    "",
    "RECENT ACTIVITY (most recent first):",
    activityBlock,
  ].join("\n")
}

function instructionFor(action: CopilotAction): string {
  switch (action) {
    case "summary":
      return "Write a concise status summary of this deal (3–5 sentences or short bullet lines): where it stands, momentum from the recent activity, and any risk or blocker you can see in the context. Ground every statement in the deal context above."
    case "email":
      return "Draft a short, professional follow-up email from the deal owner to the customer, grounded in the deal context and the most recent activity. Start with a `Subject:` line. Keep the body under ~150 words. Use a bracketed placeholder such as [recipient name] or [your name] for any name not present in the context. Do not invent prices, commitments, or dates that are not in the context."
    case "next_best_action":
      return "Suggest 2–3 concrete next best actions to move this deal forward, given its stage, the last activity, and the close date. Return a short numbered list; each item is one sentence, specific and actionable for this deal."
  }
}

export function buildCopilotPrompt(
  action: CopilotAction,
  opp: OpportunityRecord,
  activities: ActivityRecord[],
): { systemPrompt: string; prompt: string } {
  const context = buildDealContext(opp, activities)
  const prompt = [
    "Deal context (the ONLY source of truth — do not use anything else):",
    "",
    context,
    "",
    "TASK:",
    instructionFor(action),
  ].join("\n")
  return { systemPrompt: COPILOT_SYSTEM_PROMPT, prompt }
}

export interface DealCopilotResult {
  ok: boolean
  text?: string
  model?: string | null
  /** True when no AI provider is configured — the UI renders a disabled hint. */
  unconfigured?: boolean
  error?: string
}

/** Injected for testing; production uses the DB-driven chain + the real aiCall. */
export interface DealCopilotDeps {
  resolveAdapters?: () => Promise<Map<ProviderName, ProviderAdapter>>
  aiCall?: typeof aiCall
}

function failureMessage(reason: string | undefined): string {
  if (reason === "service_unavailable") {
    return "Your daily AI budget has been reached. Try again later or ask an admin to raise the cap."
  }
  return "The AI provider could not be reached. Please try again."
}

/**
 * Run one Copilot action for a deal. Assembles the grounded prompt and routes it
 * through the shared aiCall seam (caps + usage logging apply). If no provider is
 * configured the model is NEVER called — returns `unconfigured` so the UI can show
 * the "configure a provider" hint instead of throwing.
 */
export async function runDealCopilot(
  userId: string,
  action: CopilotAction,
  opportunity: OpportunityRecord,
  activities: ActivityRecord[],
  deps: DealCopilotDeps = {},
): Promise<DealCopilotResult> {
  const feature = featureFor(action)
  // Pass the feature through so a per-feature provider override (ORR-674) is
  // honored for copilot actions too, mirroring extraction-core (ORR-807b). The
  // previous no-arg call resolved the global chain and ignored the override.
  const resolveAdapters = deps.resolveAdapters ?? (() => createProviderAdapters(feature))
  const call = deps.aiCall ?? aiCall

  const adapters = await resolveAdapters()
  if (adapters.size === 0) {
    return { ok: false, unconfigured: true, error: COPILOT_UNCONFIGURED_MESSAGE }
  }

  const { systemPrompt, prompt } = buildCopilotPrompt(action, opportunity, activities)

  const result = await call(
    {
      feature,
      userId,
      prompt,
      systemPrompt,
      estimatedCost: COPILOT_ESTIMATED_COST,
      estimatePromptTokens: estimateTokens(systemPrompt) + estimateTokens(prompt),
      estimateCompletionTokens: COPILOT_COMPLETION_TOKEN_BUDGET,
      requestId: `copilot-${action}-${randomUUID()}`,
    },
    { adapters },
  )

  if (!result.ok) {
    return { ok: false, error: failureMessage(result.reason) }
  }

  const text = (result.data ?? "").trim()
  if (!text) {
    return { ok: false, error: "The Copilot returned an empty response. Please try again." }
  }
  return { ok: true, text, model: result.model ?? null }
}

/**
 * Whether at least one AI provider is usable (admin DB config or env fallback).
 * Used server-side to render the Copilot card enabled or disabled. Never throws.
 */
export async function isDealCopilotConfigured(): Promise<boolean> {
  try {
    return (await resolveProviderChain()).length > 0
  } catch {
    return false
  }
}
