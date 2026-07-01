import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockSingle = vi.fn()
const mockFrom = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockOrder = vi.fn()
const mockInsert = vi.fn()
const mockIn = vi.fn()

function buildQueryBuilder() {
  mockSelect.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, in: mockIn })
  mockEq.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, in: mockIn })
  mockOrder.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, in: mockIn })
  // Default for the separate creator-name lookup (getStageHistory queries users).
  mockIn.mockResolvedValue({ data: [{ id: "user-1", full_name: "Alice" }], error: null })
  return { select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, in: mockIn }
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const mockDbRecord = {
  id: "hist-1",
  opportunity_id: "opp-1",
  from_stage: "qualify",
  to_stage: "meet_and_present",
  event: "ADVANCE",
  reason: null,
  created_by: "user-1",
  created_at: "2026-04-01T10:00:00Z",
  creator: { full_name: "Alice" },
}

describe("determineStageEvent", () => {
  it("returns ADVANCE when from and to are the same", async () => {
    const { determineStageEvent } = await import("../opportunity-stage-history")
    expect(determineStageEvent("qualify", "qualify")).toBe("ADVANCE")
  })

  it("returns REOPEN when moving from terminal to non-terminal", async () => {
    const { determineStageEvent } = await import("../opportunity-stage-history")
    expect(determineStageEvent("closed_lost", "qualify")).toBe("REOPEN")
    expect(determineStageEvent("closed_won", "meet_and_present")).toBe("REOPEN")
  })

  it("returns CLOSE_WON when moving to closed_won", async () => {
    const { determineStageEvent } = await import("../opportunity-stage-history")
    expect(determineStageEvent("negotiate", "closed_won")).toBe("CLOSE_WON")
  })

  it("returns CLOSE_LOST when moving to closed_lost", async () => {
    const { determineStageEvent } = await import("../opportunity-stage-history")
    expect(determineStageEvent("propose", "closed_lost")).toBe("CLOSE_LOST")
  })

  it("returns ADVANCE when moving forward", async () => {
    const { determineStageEvent } = await import("../opportunity-stage-history")
    expect(determineStageEvent("qualify", "meet_and_present")).toBe("ADVANCE")
    expect(determineStageEvent("meet_and_present", "propose")).toBe("ADVANCE")
  })

  it("returns MOVE_BACKWARD when moving backward", async () => {
    const { determineStageEvent } = await import("../opportunity-stage-history")
    expect(determineStageEvent("negotiate", "propose")).toBe("MOVE_BACKWARD")
    expect(determineStageEvent("propose", "qualify")).toBe("MOVE_BACKWARD")
  })
})

describe("toDbInsert", () => {
  it("maps camelCase params to snake_case columns", async () => {
    const { toDbInsert } = await import("../opportunity-stage-history")
    const result = toDbInsert({
      opportunityId: "opp-1",
      fromStage: "qualify",
      toStage: "meet_and_present",
      event: "ADVANCE",
      createdBy: "user-1",
    })

    expect(result.opportunity_id).toBe("opp-1")
    expect(result.from_stage).toBe("qualify")
    expect(result.to_stage).toBe("meet_and_present")
    expect(result.event).toBe("ADVANCE")
    expect(result.created_by).toBe("user-1")
    expect(result.reason).toBeNull()
  })

  it("includes reason when provided", async () => {
    const { toDbInsert } = await import("../opportunity-stage-history")
    const result = toDbInsert({
      opportunityId: "opp-1",
      fromStage: "qualify",
      toStage: "meet_and_present",
      event: "ADVANCE",
      reason: "Qualified lead",
    })

    expect(result.reason).toBe("Qualified lead")
  })

  it("omits createdBy when not provided", async () => {
    const { toDbInsert } = await import("../opportunity-stage-history")
    const result = toDbInsert({
      opportunityId: "opp-1",
      fromStage: "qualify",
      toStage: "meet_and_present",
      event: "ADVANCE",
    })

    expect(result.created_by).toBeNull()
  })
})

describe("fromDbRecord", () => {
  it("maps snake_case DB record to camelCase domain model", async () => {
    const { fromDbRecord } = await import("../opportunity-stage-history")
    const result = fromDbRecord(mockDbRecord as Record<string, unknown>)

    expect(result.id).toBe("hist-1")
    expect(result.opportunityId).toBe("opp-1")
    expect(result.fromStage).toBe("qualify")
    expect(result.toStage).toBe("meet_and_present")
    expect(result.event).toBe("ADVANCE")
    expect(result.reason).toBeNull()
    expect(result.createdBy).toBe("user-1")
    expect(result.createdByName).toBe("Alice")
    expect(result.createdAt).toBe("2026-04-01T10:00:00Z")
  })

  it("handles null creator gracefully", async () => {
    const { fromDbRecord } = await import("../opportunity-stage-history")
    const result = fromDbRecord({ ...mockDbRecord, creator: null } as Record<string, unknown>)

    expect(result.createdByName).toBeNull()
  })
})

describe("getStageHistoryForOpportunity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildQueryBuilder()
    mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle, order: mockOrder, in: mockIn })
  })

  it("returns mapped stage history records ordered by created_at desc", async () => {
    mockOrder.mockResolvedValueOnce({ data: [mockDbRecord], error: null })

    const { getStageHistoryForOpportunity } = await import("../opportunity-stage-history")
    const result = await getStageHistoryForOpportunity(defaultCtx, "opp-1")

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("hist-1")
    expect(result[0].opportunityId).toBe("opp-1")
    expect(result[0].createdByName).toBe("Alice")
  })

  it("queries with correct filters", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    const { getStageHistoryForOpportunity } = await import("../opportunity-stage-history")
    await getStageHistoryForOpportunity(defaultCtx, "opp-1")

    expect(mockFrom).toHaveBeenCalledWith("opportunity_stage_history")
    expect(mockEq).toHaveBeenCalledWith("opportunity_id", "opp-1")
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false })
  })

  it("resolves creator names via a separate users lookup, not a PostgREST embed", async () => {
    mockOrder.mockResolvedValueOnce({ data: [mockDbRecord], error: null })
    mockIn.mockResolvedValueOnce({ data: [{ id: "user-1", full_name: "Alice" }], error: null })

    const { getStageHistoryForOpportunity } = await import("../opportunity-stage-history")
    const result = await getStageHistoryForOpportunity(defaultCtx, "opp-1")

    // No embed on the history query (created_by has no FK to users).
    expect(mockSelect).not.toHaveBeenCalledWith(
      expect.stringContaining("creator:created_by"),
    )
    // Names come from a follow-up users lookup keyed by the distinct creator ids.
    expect(mockFrom).toHaveBeenCalledWith("users")
    expect(mockIn).toHaveBeenCalledWith("id", ["user-1"])
    expect(result[0].createdByName).toBe("Alice")
  })

  it("returns empty array when no history exists", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    const { getStageHistoryForOpportunity } = await import("../opportunity-stage-history")
    const result = await getStageHistoryForOpportunity(defaultCtx, "opp-1")

    expect(result).toEqual([])
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error("DB error") })

    const { getStageHistoryForOpportunity } = await import("../opportunity-stage-history")
    await expect(
      getStageHistoryForOpportunity(defaultCtx, "opp-1"),
    ).rejects.toThrow("Failed to load stage history")
  })
})

describe("insertStageHistoryEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert })
    mockInsert.mockResolvedValue({ error: null })
  })

  it("inserts a stage history entry with correct mapping", async () => {
    const { insertStageHistoryEntry } = await import("../opportunity-stage-history")
    await insertStageHistoryEntry(defaultCtx, {
      opportunityId: "opp-1",
      fromStage: "qualify",
      toStage: "meet_and_present",
      event: "ADVANCE",
      createdBy: "user-1",
    })

    expect(mockFrom).toHaveBeenCalledWith("opportunity_stage_history")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunity_id: "opp-1",
        from_stage: "qualify",
        to_stage: "meet_and_present",
        event: "ADVANCE",
        created_by: "user-1",
      }),
    )
  })

  it("throws on insert error", async () => {
    mockInsert.mockResolvedValueOnce({ error: new Error("Insert failed") })

    const { insertStageHistoryEntry } = await import("../opportunity-stage-history")
    await expect(
      insertStageHistoryEntry(defaultCtx, {
        opportunityId: "opp-1",
        fromStage: "qualify",
        toStage: "meet_and_present",
        event: "ADVANCE",
      }),
    ).rejects.toThrow("Failed to insert stage history")
  })
})
