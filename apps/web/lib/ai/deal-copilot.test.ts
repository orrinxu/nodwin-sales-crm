import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  runDealCopilot,
  buildDealContext,
  buildCopilotPrompt,
  COPILOT_SYSTEM_PROMPT,
  COPILOT_UNCONFIGURED_MESSAGE,
  type DealCopilotDeps,
} from "./deal-copilot"
import type { ProviderAdapter } from "./types"
import type { ProviderName } from "./providers"
import type { OpportunityRecord } from "../data/opportunities.types"
import type { ActivityRecord } from "../data/activities"

function makeOpp(over: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp-1",
    name: "Acme Esports League 2026",
    accountId: "acc-1",
    accountName: "Acme Corp",
    primaryContactId: null,
    primaryContactName: null,
    stage: "propose",
    probabilityPct: 60,
    amount: "50000.00",
    currency: "USD",
    ownerUserId: "user-1",
    ownerName: "Dana Owner",
    salesUnitId: "bu-1",
    revenueRecognitionUnitId: null,
    billingEntityId: null,
    entitySalesId: null,
    serviceType: ["broadcast"],
    propertyType: null,
    barterValue: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    executionDate: null,
    estimatedGrossMarginPct: null,
    countryExecution: "IN",
    projectType: null,
    revenueCategory: null,
    recurring: false,
    recurringSplitKind: null,
    description: "Multi-city esports league proposal.",
    closeDate: "2026-09-01",
    lossReason: null,
    visibilityTier: "standard",
    customData: {},
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-05T00:00:00Z",
    ...over,
  }
}

function makeActivity(over: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: "act-1",
    opportunityId: "opp-1",
    opportunityName: "Acme Esports League 2026",
    accountId: "acc-1",
    accountName: "Acme Corp",
    contactId: null,
    contactName: null,
    userId: "user-1",
    userName: "Dana Owner",
    type: "call",
    externalThreadId: null,
    subject: "Intro call",
    body: "Discussed sponsorship tiers and next steps.",
    metadata: {},
    createdAt: "2026-07-04T00:00:00Z",
    updatedAt: "2026-07-04T00:00:00Z",
    ...over,
  }
}

/** A non-empty adapters map so the "configured" path is exercised. */
function adaptersWithOne(): Map<ProviderName, ProviderAdapter> {
  return new Map([["claude", { call: vi.fn() } as unknown as ProviderAdapter]])
}

describe("COPILOT_SYSTEM_PROMPT (grounding / anti-hallucination)", () => {
  it("forbids outside knowledge and fabricated facts", () => {
    expect(COPILOT_SYSTEM_PROMPT).toMatch(/only the deal context/i)
    expect(COPILOT_SYSTEM_PROMPT).toMatch(/never fabricate|do not invent/i)
    expect(COPILOT_SYSTEM_PROMPT).toMatch(/names.*amounts.*dates|amounts.*dates/i)
  })
})

describe("buildDealContext", () => {
  it("includes known deal fields and recent activity, omits empty fields", () => {
    const ctx = buildDealContext(makeOpp(), [makeActivity()])
    expect(ctx).toContain("Acme Esports League 2026")
    expect(ctx).toContain("Acme Corp")
    expect(ctx).toContain("Propose") // stage label, not raw enum
    expect(ctx).toContain("$50,000") // formatted money
    expect(ctx).toContain("Intro call")
    expect(ctx).toContain("Discussed sponsorship tiers")
    // an unset field must not appear as an empty line
    expect(ctx).not.toContain("Loss reason")
  })

  it("notes when no activities exist", () => {
    const ctx = buildDealContext(makeOpp(), [])
    expect(ctx).toMatch(/no activities/i)
  })
})

describe("buildCopilotPrompt", () => {
  it("uses the system prompt and embeds the deal context + task instruction", () => {
    const { systemPrompt, prompt } = buildCopilotPrompt("email", makeOpp(), [makeActivity()])
    expect(systemPrompt).toBe(COPILOT_SYSTEM_PROMPT)
    expect(prompt).toContain("Acme Esports League 2026")
    expect(prompt).toMatch(/Subject:/) // email instruction
    expect(prompt).toMatch(/ONLY source of truth/i)
  })
})

describe("runDealCopilot", () => {
  it("assembles the right context and passes the feature tag through aiCall", async () => {
    const aiCall = vi.fn().mockResolvedValue({ ok: true, data: "Deal is progressing well.", model: "claude-x" })
    const deps: DealCopilotDeps = { aiCall, resolveAdapters: async () => adaptersWithOne() }

    const res = await runDealCopilot("user-1", "summary", makeOpp(), [makeActivity()], deps)

    expect(res).toMatchObject({ ok: true, text: "Deal is progressing well.", model: "claude-x" })
    expect(aiCall).toHaveBeenCalledTimes(1)
    const [params, callDeps] = aiCall.mock.calls[0]
    expect(params.feature).toBe("summarise_deal")
    expect(params.userId).toBe("user-1")
    expect(params.prompt).toContain("Acme Esports League 2026")
    expect(params.systemPrompt).toBe(COPILOT_SYSTEM_PROMPT)
    expect(params.estimatedCost).toBeDefined() // non-zero estimate → caps engage
    expect(params.requestId).toMatch(/^copilot-summary-/)
    // routed through the shared seam with the resolved adapters map
    expect(callDeps.adapters.size).toBe(1)
  })

  it("maps each action to its distinct feature tag", async () => {
    const cases: Array<["summary" | "email" | "next_best_action", string]> = [
      ["summary", "summarise_deal"],
      ["email", "draft_email"],
      ["next_best_action", "next_best_action"],
    ]
    for (const [action, feature] of cases) {
      const aiCall = vi.fn().mockResolvedValue({ ok: true, data: "ok", model: "m" })
      await runDealCopilot("u", action, makeOpp(), [], { aiCall, resolveAdapters: async () => adaptersWithOne() })
      expect(aiCall.mock.calls[0][0].feature).toBe(feature)
    }
  })

  it("GRACEFUL: no provider configured → unconfigured result, model NOT called", async () => {
    const aiCall = vi.fn()
    const res = await runDealCopilot("u", "summary", makeOpp(), [], {
      aiCall,
      resolveAdapters: async () => new Map(),
    })
    expect(res.ok).toBe(false)
    expect(res.unconfigured).toBe(true)
    expect(res.error).toBe(COPILOT_UNCONFIGURED_MESSAGE)
    expect(aiCall).not.toHaveBeenCalled()
  })

  it("surfaces a budget message when the cap enforcer rejects the call", async () => {
    const aiCall = vi.fn().mockResolvedValue({ ok: false, reason: "service_unavailable" })
    const res = await runDealCopilot("u", "summary", makeOpp(), [], {
      aiCall,
      resolveAdapters: async () => adaptersWithOne(),
    })
    expect(res.ok).toBe(false)
    expect(res.unconfigured).toBeUndefined()
    expect(res.error).toMatch(/daily AI budget/i)
  })

  it("treats an empty model response as an error", async () => {
    const aiCall = vi.fn().mockResolvedValue({ ok: true, data: "   ", model: "m" })
    const res = await runDealCopilot("u", "summary", makeOpp(), [], {
      aiCall,
      resolveAdapters: async () => adaptersWithOne(),
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/empty response/i)
  })
})
