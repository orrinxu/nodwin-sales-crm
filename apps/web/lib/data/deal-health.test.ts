import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const { store, rpcCalls } = vi.hoisted(() => ({
  store: { activities: [] as { opportunity_id: string; created_at: string }[] },
  rpcCalls: [] as { fn: string; ids: string[] }[],
}))

// MAX(activities.created_at) per opp — mirrors the stuck_deal_last_activity RPC.
async function rpc(fn: string, args: { opp_ids: string[] }) {
  rpcCalls.push({ fn, ids: args.opp_ids })
  const maxByOpp = new Map<string, string>()
  for (const a of store.activities) {
    if (!args.opp_ids.includes(a.opportunity_id)) continue
    const prev = maxByOpp.get(a.opportunity_id)
    if (prev === undefined || a.created_at > prev) maxByOpp.set(a.opportunity_id, a.created_at)
  }
  return {
    data: [...maxByOpp].map(([opportunity_id, last_activity_at]) => ({
      opportunity_id,
      last_activity_at,
    })),
    error: null,
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
}))

vi.mock("./stuck-deal-settings", () => ({
  resolveStuckThresholds: async () => ({
    qualify: 21, meet_and_present: 14, propose: 10, negotiate: 7, verbal_agreement: 5,
  }),
}))

import { getDealHealthByOpportunity, attachDealHealth } from "./deal-health"
import type { OpportunityRecord } from "./opportunities.types"

const NOW = new Date("2026-07-05T12:00:00.000Z")
const DAY = 86_400_000
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY).toISOString()
}

const ctx = { user: { id: "me" } as never, source: "web" as const }

// Minimal opportunity record — only the fields the health fetch reads matter; the
// rest are padded so the OpportunityRecord type is satisfied.
function opp(o: {
  id: string
  stage: string
  closeDate?: string | null
  createdAt?: string
}): OpportunityRecord {
  return {
    id: o.id,
    name: `Deal ${o.id}`,
    accountId: "acct",
    accountName: null,
    primaryContactId: null,
    primaryContactName: null,
    stage: o.stage as OpportunityRecord["stage"],
    probabilityPct: 0,
    amount: "0.00",
    currency: "USD",
    ownerUserId: "me",
    ownerName: null,
    salesUnitId: "unit",
    revenueRecognitionUnitId: null,
    billingEntityId: null,
    entitySalesId: null,
    serviceType: null,
    propertyType: null,
    barterValue: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    executionDate: null,
    estimatedGrossMarginPct: null,
    countryExecution: null,
    projectType: null,
    revenueCategory: null,
    recurring: false,
    recurringSplitKind: null,
    description: null,
    closeDate: o.closeDate ?? null,
    lossReason: null,
    visibilityTier: "standard",
    customData: {},
    createdAt: o.createdAt ?? daysAgo(60),
    updatedAt: daysAgo(1),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  store.activities = []
  rpcCalls.length = 0
})
afterEach(() => vi.useRealTimers())

describe("getDealHealthByOpportunity", () => {
  it("returns an empty map and makes NO rpc call when there are no open deals", async () => {
    const map = await getDealHealthByOpportunity(ctx, [
      opp({ id: "won", stage: "closed_won" }),
      opp({ id: "lost", stage: "closed_lost" }),
    ])
    expect(map.size).toBe(0)
    expect(rpcCalls).toHaveLength(0)
  })

  it("issues exactly ONE batched rpc for the whole open set (no N+1)", async () => {
    const map = await getDealHealthByOpportunity(ctx, [
      opp({ id: "A", stage: "qualify", createdAt: daysAgo(1), closeDate: "2026-12-01" }),
      opp({ id: "B", stage: "negotiate", createdAt: daysAgo(1), closeDate: "2026-12-01" }),
      opp({ id: "C", stage: "propose", createdAt: daysAgo(1), closeDate: "2026-12-01" }),
      opp({ id: "won", stage: "closed_won" }), // excluded from the rpc ids
    ])
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe("stuck_deal_last_activity")
    expect(rpcCalls[0].ids.sort()).toEqual(["A", "B", "C"])
    // All fresh & on-time → no signals, so no entries.
    expect(map.size).toBe(0)
  })

  it("flags overdue with a day count", async () => {
    store.activities = [{ opportunity_id: "A", created_at: daysAgo(1) }] // fresh → not stale
    const map = await getDealHealthByOpportunity(ctx, [
      opp({ id: "A", stage: "qualify", closeDate: "2026-06-30", createdAt: daysAgo(1) }),
    ])
    expect(map.get("A")?.overdue).toEqual({ days: 5 })
    expect(map.get("A")?.stale).toBeNull()
  })

  it("flags stale from MAX(activity) past the per-stage threshold", async () => {
    store.activities = [{ opportunity_id: "B", created_at: daysAgo(30) }]
    const map = await getDealHealthByOpportunity(ctx, [
      opp({ id: "B", stage: "negotiate", closeDate: "2026-12-01" }), // threshold 7
    ])
    expect(map.get("B")?.stale).toEqual({ days: 30, thresholdDays: 7 })
    expect(map.get("B")?.overdue).toBeNull()
  })

  it("ages a zero-activity deal from created_at", async () => {
    const map = await getDealHealthByOpportunity(ctx, [
      opp({ id: "C", stage: "propose", closeDate: "2026-12-01", createdAt: daysAgo(40) }), // threshold 10
    ])
    expect(map.get("C")?.stale).toEqual({ days: 40, thresholdDays: 10 })
  })

  it("omits healthy deals and never includes terminal deals", async () => {
    store.activities = [
      { opportunity_id: "fresh", created_at: daysAgo(1) },
      { opportunity_id: "won", created_at: daysAgo(1) },
    ]
    const map = await getDealHealthByOpportunity(ctx, [
      opp({ id: "fresh", stage: "qualify", closeDate: "2026-12-01", createdAt: daysAgo(2) }),
      opp({ id: "won", stage: "closed_won", closeDate: "2026-01-01", createdAt: daysAgo(400) }),
    ])
    expect(map.has("fresh")).toBe(false)
    expect(map.has("won")).toBe(false)
  })
})

describe("attachDealHealth", () => {
  it("attaches health to matching records and null elsewhere", async () => {
    store.activities = [{ opportunity_id: "stale", created_at: daysAgo(30) }]
    const attached = await attachDealHealth(ctx, [
      opp({ id: "stale", stage: "negotiate", closeDate: "2026-12-01" }),
      opp({ id: "fresh", stage: "qualify", closeDate: "2026-12-01", createdAt: daysAgo(1) }),
      opp({ id: "won", stage: "closed_won" }),
    ])
    const byId = new Map(attached.map((o) => [o.id, o]))
    expect(byId.get("stale")?.health?.stale).toEqual({ days: 30, thresholdDays: 7 })
    expect(byId.get("fresh")?.health).toBeNull()
    expect(byId.get("won")?.health).toBeNull()
  })
})
