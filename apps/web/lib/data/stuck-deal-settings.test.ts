import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const { store } = vi.hoisted(() => ({
  store: {
    rows: [] as { stage: string; threshold_days: number }[],
    updates: [] as { patch: Record<string, unknown>; stage: unknown }[],
  },
}))

vi.mock("@/lib/security/env", () => ({
  env: { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" },
}))

class QB {
  private op: "select" | "update" = "select"
  private patch: Record<string, unknown> = {}
  select() { return this }
  update(patch: Record<string, unknown>) { this.op = "update"; this.patch = patch; return this }
  eq(_col: string, val: unknown) {
    if (this.op === "update") { store.updates.push({ patch: this.patch, stage: val }); return Promise.resolve({ error: null }) }
    return this
  }
  then<T>(onF: (v: { data: unknown; error: null }) => T) {
    return Promise.resolve({ data: store.rows, error: null }).then(onF)
  }
}
const client = { from: () => new QB() }
vi.mock("@supabase/ssr", () => ({ createServerClient: () => client }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => client }))

import {
  resolveStuckThresholds, getStuckDealSettings, updateStuckDealSettings,
  STUCK_DEAL_DEFAULT_THRESHOLDS,
} from "./stuck-deal-settings"

const ctx = { user: { id: "admin-1" } as never, source: "web" as const }

beforeEach(() => { store.rows = []; store.updates = [] })

describe("resolveStuckThresholds (DB-first + fallback)", () => {
  it("returns the constant defaults when the table is empty", async () => {
    const t = await resolveStuckThresholds()
    expect(t).toEqual(STUCK_DEAL_DEFAULT_THRESHOLDS)
  })

  it("DB rows override defaults per stage; unset stages keep the default", async () => {
    store.rows = [{ stage: "qualify", threshold_days: 30 }, { stage: "negotiate", threshold_days: 3 }]
    const t = await resolveStuckThresholds()
    expect(t.qualify).toBe(30)       // DB wins
    expect(t.negotiate).toBe(3)      // DB wins
    expect(t.propose).toBe(STUCK_DEAL_DEFAULT_THRESHOLDS.propose) // gap → default
  })

  it("ignores unknown/closed stages in the DB", async () => {
    store.rows = [{ stage: "closed_won", threshold_days: 99 }, { stage: "bogus", threshold_days: 1 }]
    const t = await resolveStuckThresholds()
    expect(t).toEqual(STUCK_DEAL_DEFAULT_THRESHOLDS)
    expect(t).not.toHaveProperty("closed_won")
  })
})

describe("getStuckDealSettings (admin view)", () => {
  it("lists all five open stages with effective values, in pipeline order", async () => {
    store.rows = [{ stage: "propose", threshold_days: 12 }]
    const rows = await getStuckDealSettings(ctx)
    expect(rows.map((r) => r.stage)).toEqual(["qualify", "meet_and_present", "propose", "negotiate", "verbal_agreement"])
    expect(rows.find((r) => r.stage === "propose")!.thresholdDays).toBe(12)
    expect(rows.find((r) => r.stage === "qualify")!.thresholdDays).toBe(STUCK_DEAL_DEFAULT_THRESHOLDS.qualify)
    expect(rows.find((r) => r.stage === "meet_and_present")!.label).toBe("Meet & Present")
  })
})

describe("updateStuckDealSettings", () => {
  it("writes threshold_days per stage with updated_by, validating the range", async () => {
    await updateStuckDealSettings(ctx, { thresholds: [{ stage: "qualify", thresholdDays: 25 }] })
    expect(store.updates).toHaveLength(1)
    expect(store.updates[0].stage).toBe("qualify")
    expect(store.updates[0].patch).toMatchObject({ threshold_days: 25, updated_by: "admin-1" })
  })

  it("rejects out-of-range or non-open-stage input", async () => {
    await expect(updateStuckDealSettings(ctx, { thresholds: [{ stage: "qualify", thresholdDays: 0 }] })).rejects.toThrow()
    await expect(
      updateStuckDealSettings(ctx, { thresholds: [{ stage: "closed_won" as never, thresholdDays: 5 }] }),
    ).rejects.toThrow()
  })
})
