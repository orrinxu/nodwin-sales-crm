import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockSingle = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockMoneyFromAmount = vi.fn()

const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockOrder = vi.fn()
const mockUpdate = vi.fn()

function buildQueryBuilder() {
  mockSelect.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder })
  mockEq.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder })
  mockOrder.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder })
  return { select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder }
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

vi.mock("@/lib/money", () => ({
  Money: {
    fromAmount: (...args: unknown[]) => mockMoneyFromAmount(...args),
  },
}))

const stageHistoryMocks = vi.hoisted(() => ({
  insertStageHistoryEntry: vi.fn(),
  determineStageEvent: vi.fn(),
}))
const triggerMocks = vi.hoisted(() => ({
  notifyStageChange: vi.fn(),
  notifyDealAssigned: vi.fn(),
}))
const prefsMocks = vi.hoisted(() => ({
  getUserPreferences: vi.fn(),
}))
vi.mock("@/lib/data/opportunity-stage-history", () => stageHistoryMocks)
vi.mock("@/lib/notifications/triggers", () => triggerMocks)
// ORR-797: closing a deal now resolves close_date in the caller's timezone via
// getUserPreferences. Mock it so the unit tests don't hit the DB and stay
// deterministic.
vi.mock("@/lib/data/user-preferences", () => prefsMocks)

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const mockDbOpportunity = {
  id: "opp-1",
  name: "Big Deal",
  account_id: "acct-1",
  primary_contact_id: null,
  stage: "negotiate",
  probability_pct: 75,
  amount: 50000,
  currency: "USD",
  owner_user_id: "user-1",
  sales_unit_id: "bu-1",
  description: "A promising opportunity",
  close_date: "2026-06-30",
  loss_reason: null,
  custom_data: { deal_type: "Enterprise" },
  created_at: "2026-01-15T08:00:00Z",
  updated_at: "2026-04-01T10:00:00Z",
  account: { name: "Acme Corp" },
  owner: { full_name: "Alice" },
}

describe("updateOpportunity", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    buildQueryBuilder()
    mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, update: mockUpdate })
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockMoneyFromAmount.mockReturnValue({ toAmount: () => "50000.00" })
    prefsMocks.getUserPreferences.mockResolvedValue({ timezone: "UTC" })
  })

  it("updates a single field (name only)", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, name: "Bigger Deal" }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    const result = await updateOpportunity(defaultCtx, "opp-1", { name: "Bigger Deal" })

    expect(result.name).toBe("Bigger Deal")
    expect(mockUpdate).toHaveBeenCalledWith({ name: "Bigger Deal" })
  })

  it("blocks moving to Closed Won without an approved approval (3c gate)", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbOpportunity, error: null }) // existing (negotiate)
    mockRpc.mockResolvedValue({ data: false, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await expect(
      updateOpportunity(defaultCtx, "opp-1", { stage: "closed_won" }),
    ).rejects.toThrow("approved approval")
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("allows Closed Won when an approved approval exists (3c gate)", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "closed_won" }, error: null })
    mockRpc.mockResolvedValue({ data: true, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { stage: "closed_won" })
    expect(mockRpc).toHaveBeenCalledWith("opportunity_has_approved_approval", { _opportunity_id: "opp-1" })
    // ORR-797: closing also stamps close_date (today, user TZ). No explicit
    // close_date in this edit, so the auto value is applied.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "closed_won", close_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    )
  })

  it("blocks BULK Closed Won when an opp lacks an approved approval (3c gate)", async () => {
    const updateIn = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: "opp-1", stage: "negotiate" }], error: null }) }),
      update: vi.fn().mockReturnValue({ in: updateIn }),
    })
    mockRpc.mockResolvedValue({ data: false, error: null })

    const { bulkUpdateOpportunityStage } = await import("../opportunities")
    await expect(
      bulkUpdateOpportunityStage(defaultCtx, { ids: ["opp-1"], stage: "closed_won" }),
    ).rejects.toThrow("approved approval")
    expect(updateIn).not.toHaveBeenCalled()
  })

  it("allows BULK Closed Won when all opps are approved (3c gate)", async () => {
    const updateIn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ in: updateIn })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: "opp-1", stage: "negotiate" }], error: null }) }),
      update: updateFn,
    })
    mockRpc.mockResolvedValue({ data: true, error: null })

    const { bulkUpdateOpportunityStage } = await import("../opportunities")
    await bulkUpdateOpportunityStage(defaultCtx, { ids: ["opp-1"], stage: "closed_won" })
    // ORR-797: bulk-closing stamps close_date on the transitioning rows too.
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "closed_won", close_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    )
    expect(updateIn).toHaveBeenCalledWith("id", ["opp-1"])
  })

  it("updates multiple fields", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({
        data: { ...mockDbOpportunity, name: "Bigger Deal", probability_pct: 90, close_date: "2026-08-01" },
        error: null,
      })

    const { updateOpportunity } = await import("../opportunities")
    const result = await updateOpportunity(defaultCtx, "opp-1", {
      name: "Bigger Deal",
      probabilityPct: 90,
      closeDate: "2026-08-01",
    })

    expect(result.name).toBe("Bigger Deal")
    expect(result.probabilityPct).toBe(90)
    expect(mockUpdate).toHaveBeenCalledWith({ name: "Bigger Deal", probability_pct: 90, close_date: "2026-08-01" })
  })

  it("updates amount using Money conversion", async () => {
    mockMoneyFromAmount
      .mockReturnValueOnce({ toAmount: () => "100000.00" })
      .mockReturnValueOnce({ toAmount: () => "100000.00" })
      .mockReturnValueOnce({ toAmount: () => "100000.00" })

    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, amount: 100000 }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    const result = await updateOpportunity(defaultCtx, "opp-1", { amount: "100000" })

    expect(result.amount).toBe("100000.00")
    expect(mockMoneyFromAmount).toHaveBeenNthCalledWith(2, "100000", "USD")
    expect(mockUpdate).toHaveBeenCalledWith({ amount: "100000.00" })
  })

  it("throws when opportunity not found for update", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })

    const { updateOpportunity } = await import("../opportunities")
    await expect(
      updateOpportunity(defaultCtx, "nonexistent", { name: "Nope" }),
    ).rejects.toThrow("Opportunity not found for update")
  })

  it("skips supabase update when no fields changed", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })

    const { updateOpportunity } = await import("../opportunities")
    const result = await updateOpportunity(defaultCtx, "opp-1", {})

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result.name).toBe("Big Deal")
  })

  it("clears closeDate when empty string is passed", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, close_date: null }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { closeDate: "" })

    expect(mockUpdate).toHaveBeenCalledWith({ close_date: null })
  })

  it("clears description when empty string is passed", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, description: null }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { description: "" })

    expect(mockUpdate).toHaveBeenCalledWith({ description: null })
  })

  it("throws on supabase update error", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })

    mockUpdate.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValue({ error: new Error("DB update failed") }),
    })

    const { updateOpportunity } = await import("../opportunities")
    await expect(
      updateOpportunity(defaultCtx, "opp-1", { name: "Fail" }),
    ).rejects.toThrow("Failed to update opportunity")
  })

  it("rejects invalid probability via zod schema", async () => {
    const { updateOpportunity } = await import("../opportunities")
    await expect(
      updateOpportunity(defaultCtx, "opp-1", { probabilityPct: 150 }),
    ).rejects.toThrow()
  })

  it("updates currency", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, currency: "EUR" }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { currency: "EUR" })

    expect(mockUpdate).toHaveBeenCalledWith({ currency: "EUR" })
  })

  it("throws when opportunity not found after update", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbOpportunity, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })

    mockUpdate.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    const { updateOpportunity } = await import("../opportunities")
    await expect(
      updateOpportunity(defaultCtx, "opp-1", { name: "Ghost" }),
    ).rejects.toThrow("Opportunity not found after update")
  })
})

describe("updateOpportunity — stage change side effects (ORR-694)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    buildQueryBuilder()
    mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, update: mockUpdate })
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockMoneyFromAmount.mockReturnValue({ toAmount: () => "50000.00" })
    prefsMocks.getUserPreferences.mockResolvedValue({ timezone: "UTC" })
    // enforce/approval gates pass by default so we reach the stage-change path
    mockRpc.mockResolvedValue({ data: true, error: null })
    stageHistoryMocks.determineStageEvent.mockReturnValue("advanced")
    stageHistoryMocks.insertStageHistoryEntry.mockResolvedValue(undefined)
    triggerMocks.notifyStageChange.mockResolvedValue(undefined)
  })

  it("records stage history AND notifies when the stage changes", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "verbal_agreement" }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { stage: "verbal_agreement" })

    expect(stageHistoryMocks.insertStageHistoryEntry).toHaveBeenCalledWith(
      defaultCtx,
      expect.objectContaining({
        opportunityId: "opp-1",
        fromStage: "negotiate",
        toStage: "verbal_agreement",
        createdBy: "user-1",
      }),
    )
    // notification is fire-and-forget via dynamic import
    await vi.waitFor(() =>
      expect(triggerMocks.notifyStageChange).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunityId: "opp-1",
          fromStage: "negotiate",
          toStage: "verbal_agreement",
        }),
      ),
    )
  })

  it("does NOT record history or notify when the stage is unchanged", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate", name: "Renamed" }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    // stage is provided but equal to the existing stage
    await updateOpportunity(defaultCtx, "opp-1", { stage: "negotiate", name: "Renamed" })

    expect(stageHistoryMocks.insertStageHistoryEntry).not.toHaveBeenCalled()
    expect(triggerMocks.notifyStageChange).not.toHaveBeenCalled()
  })

  it("does not record history when no stage field is provided", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, name: "Just a rename" }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { name: "Just a rename" })

    expect(stageHistoryMocks.insertStageHistoryEntry).not.toHaveBeenCalled()
    expect(triggerMocks.notifyStageChange).not.toHaveBeenCalled()
  })
})

describe("enforce_gate (Phase 4)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // clearAllMocks does not drain queued mockResolvedValueOnce values. The
    // "blocks" test throws at the gate before consuming its second queued
    // single() result, so without a reset that leftover leaks into the next
    // test and shifts every subsequent single() by one.
    mockSingle.mockReset()
    vi.resetModules()
    buildQueryBuilder()
    mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, update: mockUpdate })
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockMoneyFromAmount.mockReturnValue({ toAmount: () => "50000.00" })
    prefsMocks.getUserPreferences.mockResolvedValue({ timezone: "UTC" })
  })

  it("blocks forward stage advance when enforce_gate RPC returns false", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "verbal_agreement" }, error: null })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === "opportunity_check_enforce_gate") return { data: false, error: null }
      return { data: true, error: null }
    })

    const { updateOpportunityStage } = await import("../opportunities")
    await expect(
      updateOpportunityStage(defaultCtx, "opp-1", { stage: "verbal_agreement" }),
    ).rejects.toThrow("approved approval")
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("allows forward stage advance when enforce_gate RPC returns true", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "verbal_agreement" }, error: null })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === "opportunity_check_enforce_gate") return { data: true, error: null }
      return { data: true, error: null }
    })

    const { updateOpportunityStage } = await import("../opportunities")
    await updateOpportunityStage(defaultCtx, "opp-1", { stage: "verbal_agreement" })
    expect(mockUpdate).toHaveBeenCalledWith({ stage: "verbal_agreement" })
  })

  it("does not check enforce_gate for backward moves", async () => {
    const oppInPropose = { ...mockDbOpportunity, stage: "propose" }
    mockSingle
      .mockResolvedValueOnce({ data: oppInPropose, error: null })
      .mockResolvedValueOnce({ data: { ...oppInPropose, stage: "qualify" }, error: null })

    const { updateOpportunityStage } = await import("../opportunities")
    await updateOpportunityStage(defaultCtx, "opp-1", { stage: "qualify" })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({ stage: "qualify" })
  })

  it("blocks enforce_gate in updateOpportunity when advancing stage", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === "opportunity_check_enforce_gate") return { data: false, error: null }
      return { data: true, error: null }
    })

    const { updateOpportunity } = await import("../opportunities")
    await expect(
      updateOpportunity(defaultCtx, "opp-1", { stage: "verbal_agreement" }),
    ).rejects.toThrow("approved approval")
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("blocks enforce_gate in bulk update when any row fails gate", async () => {
    const updateIn = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: "opp-1", stage: "negotiate" }, { id: "opp-2", stage: "qualify" }],
          error: null,
        }),
      }),
      update: vi.fn().mockReturnValue({ in: updateIn }),
    })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === "opportunity_check_enforce_gate") return { data: false, error: null }
      return { data: true, error: null }
    })

    const { bulkUpdateOpportunityStage } = await import("../opportunities")
    await expect(
      bulkUpdateOpportunityStage(defaultCtx, { ids: ["opp-1", "opp-2"], stage: "verbal_agreement" }),
    ).rejects.toThrow("approved approval")
    expect(updateIn).not.toHaveBeenCalled()
  })

  it("allows bulk stage update when all rows pass enforce_gate", async () => {
    const updateIn = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: "opp-1", stage: "qualify" }],
          error: null,
        }),
      }),
      update: vi.fn().mockReturnValue({ in: updateIn }),
    })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === "opportunity_check_enforce_gate") return { data: true, error: null }
      return { data: true, error: null }
    })

    const { bulkUpdateOpportunityStage } = await import("../opportunities")
    await bulkUpdateOpportunityStage(defaultCtx, { ids: ["opp-1"], stage: "verbal_agreement" })
    expect(updateIn).toHaveBeenCalledWith("id", ["opp-1"])
  })

  it("throws on enforce_gate RPC error", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === "opportunity_check_enforce_gate") return { data: null, error: new Error("RPC timeout") }
      return { data: true, error: null }
    })

    const { updateOpportunityStage } = await import("../opportunities")
    await expect(
      updateOpportunityStage(defaultCtx, "opp-1", { stage: "verbal_agreement" }),
    ).rejects.toThrow("Failed to check approval gate")
  })
})

describe("close_date on stage transition (ORR-797)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    // Fixed instant so today's date is deterministic; TZ is UTC via the prefs mock.
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    buildQueryBuilder()
    mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, update: mockUpdate })
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockMoneyFromAmount.mockReturnValue({ toAmount: () => "50000.00" })
    mockRpc.mockResolvedValue({ data: true, error: null })
    prefsMocks.getUserPreferences.mockResolvedValue({ timezone: "UTC" })
    stageHistoryMocks.determineStageEvent.mockReturnValue("CLOSE_WON")
    stageHistoryMocks.insertStageHistoryEntry.mockResolvedValue(undefined)
    triggerMocks.notifyStageChange.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("updateOpportunityStage stamps today's close_date when closing won", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "closed_won", close_date: "2026-07-19" }, error: null })

    const { updateOpportunityStage } = await import("../opportunities")
    await updateOpportunityStage(defaultCtx, "opp-1", { stage: "closed_won" })

    expect(mockUpdate).toHaveBeenCalledWith({ stage: "closed_won", close_date: "2026-07-19" })
  })

  it("updateOpportunityStage stamps close_date when closing lost", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "closed_lost", close_date: "2026-07-19" }, error: null })

    const { updateOpportunityStage } = await import("../opportunities")
    await updateOpportunityStage(defaultCtx, "opp-1", { stage: "closed_lost" })

    expect(mockUpdate).toHaveBeenCalledWith({ stage: "closed_lost", close_date: "2026-07-19" })
  })

  it("updateOpportunityStage overwrites a stale expected close_date with today", async () => {
    // existing.close_date is the *expected* date 2026-06-30; closing now must
    // replace it with the actual close date.
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate", close_date: "2026-06-30" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "closed_won", close_date: "2026-07-19" }, error: null })

    const { updateOpportunityStage } = await import("../opportunities")
    await updateOpportunityStage(defaultCtx, "opp-1", { stage: "closed_won" })

    expect(mockUpdate).toHaveBeenCalledWith({ stage: "closed_won", close_date: "2026-07-19" })
  })

  it("updateOpportunityStage clears close_date on reopen (closed → open)", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "closed_won", close_date: "2026-07-19" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate", close_date: null }, error: null })

    const { updateOpportunityStage } = await import("../opportunities")
    await updateOpportunityStage(defaultCtx, "opp-1", { stage: "negotiate" })

    expect(mockUpdate).toHaveBeenCalledWith({ stage: "negotiate", close_date: null })
  })

  it("updateOpportunity (full edit) auto-sets close_date when closing without explicit date", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "closed_won", close_date: "2026-07-19" }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { stage: "closed_won" })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "closed_won", close_date: "2026-07-19" }),
    )
  })

  it("updateOpportunity (full edit) respects an explicit close_date over the auto value", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "negotiate" }, error: null })
      .mockResolvedValueOnce({ data: { ...mockDbOpportunity, stage: "closed_won", close_date: "2026-05-01" }, error: null })

    const { updateOpportunity } = await import("../opportunities")
    await updateOpportunity(defaultCtx, "opp-1", { stage: "closed_won", closeDate: "2026-05-01" })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "closed_won", close_date: "2026-05-01" }),
    )
    expect(prefsMocks.getUserPreferences).not.toHaveBeenCalled()
  })

  it("bulkUpdateOpportunityStage stamps close_date only on rows that actually close", async () => {
    const updateIn = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ in: updateIn })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          // opp-2 is already closed_won → a no-op that must NOT be re-stamped.
          data: [{ id: "opp-1", stage: "negotiate" }, { id: "opp-2", stage: "closed_won" }],
          error: null,
        }),
      }),
      update: updateFn,
    })

    const { bulkUpdateOpportunityStage } = await import("../opportunities")
    await bulkUpdateOpportunityStage(defaultCtx, { ids: ["opp-1", "opp-2"], stage: "closed_won" })

    expect(updateFn).toHaveBeenCalledWith({ stage: "closed_won", close_date: "2026-07-19" })
    expect(updateIn).toHaveBeenCalledWith("id", ["opp-1"])
  })

  it("bulkUpdateOpportunityStage clears close_date only on reopened rows", async () => {
    const updateInStage = vi.fn().mockResolvedValue({ error: null })
    const updateInClear = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi
      .fn()
      .mockReturnValueOnce({ in: updateInStage })
      .mockReturnValueOnce({ in: updateInClear })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          // opp-1 reopens from closed_won; opp-2 is a plain open→open advance.
          data: [{ id: "opp-1", stage: "closed_won" }, { id: "opp-2", stage: "qualify" }],
          error: null,
        }),
      }),
      update: updateFn,
    })

    const { bulkUpdateOpportunityStage } = await import("../opportunities")
    await bulkUpdateOpportunityStage(defaultCtx, { ids: ["opp-1", "opp-2"], stage: "negotiate" })

    expect(updateFn).toHaveBeenNthCalledWith(1, { stage: "negotiate" })
    expect(updateInStage).toHaveBeenCalledWith("id", ["opp-1", "opp-2"])
    expect(updateFn).toHaveBeenNthCalledWith(2, { close_date: null })
    expect(updateInClear).toHaveBeenCalledWith("id", ["opp-1"])
  })
})
