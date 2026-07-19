import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockSingle = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

function buildMockChain() {
  const mockEqInner = vi.fn().mockReturnValue({ single: mockSingle });
  const mockOrderInner = vi.fn();
  const mockSelectInner = vi.fn();
  const mockDeleteInner = vi.fn().mockReturnValue({ eq: mockEqInner });

  mockOrderInner.mockReturnValue({ select: mockSelectInner, eq: mockEqInner, single: mockSingle, order: mockOrderInner, delete: mockDeleteInner });
  mockSelectInner.mockReturnValue({ eq: mockEqInner, single: mockSingle, order: mockOrderInner });

  const eq = vi.fn().mockReturnValue({ single: mockSingle, order: mockOrderInner, delete: mockDeleteInner, select: mockSelectInner });

  return { select: mockSelectInner, eq, single: mockSingle, order: mockOrderInner, delete: mockDeleteInner }
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

describe("generateFlatSchedule", () => {
  it("divides USD amount evenly across 3 months, remainder to last month", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "100.00",
        currency: "USD",
        servicePeriodStart: "2026-01-01",
        servicePeriodEnd: "2026-03-31",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(3)
    expect(result[0].month.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(result[0].amount).toBe("33.33")
    expect(result[1].amount).toBe("33.33")
    expect(result[2].amount).toBe("33.34")

    const sum = result.reduce((acc, m) => acc + parseFloat(m.amount), 0)
    expect(Math.abs(sum - 100)).toBeLessThan(0.01)
  })

  it("handles scale-0 JPY currency with integer amounts, remainder to last month", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "10000",
        currency: "JPY",
        servicePeriodStart: "2026-01-01",
        servicePeriodEnd: "2026-03-31",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(3)
    expect(result[0].amount).toBe("3333")
    expect(result[1].amount).toBe("3333")
    expect(result[2].amount).toBe("3334")
  })

  it("handles scale-0 KRW currency with remainder", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "1000000",
        currency: "KRW",
        servicePeriodStart: "2026-01-01",
        servicePeriodEnd: "2026-04-30",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(4)
    const amounts = result.map((m) => parseInt(m.amount, 10))
    const sum = amounts.reduce((a, b) => a + b, 0)
    expect(sum).toBe(1000000)
  })

  it("handles scale-0 JPY with no remainder", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "30000",
        currency: "JPY",
        servicePeriodStart: "2026-01-01",
        servicePeriodEnd: "2026-03-31",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(3)
    expect(result[0].amount).toBe("10000")
    expect(result[1].amount).toBe("10000")
    expect(result[2].amount).toBe("10000")
  })

  it("handles scale-2 INR currency", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "1000.00",
        currency: "INR",
        servicePeriodStart: "2026-06-01",
        servicePeriodEnd: "2026-08-31",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(3)
    expect(result[0].amount).toBe("333.33")
    expect(result[1].amount).toBe("333.33")
    expect(result[2].amount).toBe("333.34")
  })

  it("handles scale-2 EUR currency", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "1000.00",
        currency: "EUR",
        servicePeriodStart: "2026-01-01",
        servicePeriodEnd: "2026-02-28",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(2)
    for (const m of result) {
      expect(m.amount).toMatch(/^\d+\.\d{2}$/)
    }
    const sum = result.reduce((acc, m) => acc + parseFloat(m.amount), 0)
    expect(Math.abs(sum - 1000)).toBeLessThan(0.01)
  })

  it("returns single-month schedule when start equals end", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "500.00",
        currency: "USD",
        servicePeriodStart: "2026-06-15",
        servicePeriodEnd: "2026-06-30",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe("500.00")
    expect(result[0].month.toISOString()).toBe("2026-06-15T00:00:00.000Z")
  })

  it("handles multi-year service period", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "24000.00",
        currency: "USD",
        servicePeriodStart: "2026-01-01",
        servicePeriodEnd: "2027-12-31",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(24)
    for (const m of result) {
      expect(m.amount).toBe("1000.00")
    }
    const sum = result.reduce((acc, m) => acc + parseFloat(m.amount), 0)
    expect(Math.abs(sum - 24000)).toBeLessThan(0.01)
  })

  it("anchors recognition to execution_date when later than service_period_start", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "600.00",
        currency: "USD",
        servicePeriodStart: "2026-01-01",
        servicePeriodEnd: "2026-06-30",
        executionDate: "2026-03-15",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(4)
    expect(result[0].month.toISOString()).toBe("2026-03-15T00:00:00.000Z")
    for (const m of result) {
      expect(m.amount).toBe("150.00")
    }
  })

  it("does not skip/double months for a day-31 service-period start (ORR-814d sleeper)", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "60000.00",
        currency: "USD",
        servicePeriodStart: "2026-01-31",
        servicePeriodEnd: "2026-06-30",
      },
      defaultCtx,
    )

    // Six months, each once: Jan, Feb, Mar, Apr, May, Jun — NOT Jan,Mar,Mar,May,May,Jul.
    expect(result).toHaveLength(6)

    // Bucket exactly as finance-actions monthBucket does (getUTC* → "YYYY-MM").
    const buckets = result.map(
      (m) =>
        `${m.month.getUTCFullYear()}-${String(m.month.getUTCMonth() + 1).padStart(2, "0")}`,
    )
    expect(buckets).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ])
    // No duplicates and no skipped months.
    expect(new Set(buckets).size).toBe(6)

    // Flat split holds and sums back to the total.
    for (const m of result) expect(m.amount).toBe("10000.00")
    const sum = result.reduce((acc, m) => acc + parseFloat(m.amount), 0)
    expect(sum).toBe(60000)
  })

  it("ignores execution_date when earlier than service_period_start", async () => {
    const { generateFlatSchedule } = await import("../revenue-schedule")
    const result = generateFlatSchedule(
      {
        amount: "300.00",
        currency: "USD",
        servicePeriodStart: "2026-06-01",
        servicePeriodEnd: "2026-08-31",
        executionDate: "2026-01-01",
      },
      defaultCtx,
    )

    expect(result).toHaveLength(3)
    expect(result[0].month.toISOString()).toBe("2026-06-01T00:00:00.000Z")
    for (const m of result) {
      expect(m.amount).toBe("100.00")
    }
  })
})

describe("getCustomSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const chain = buildMockChain()
    mockFrom.mockReturnValue(chain)
  })

  it("returns mapped rows from the database", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })
    const mockRows = [
      {
        id: "sched-1",
        opportunity_id: "opp-1",
        month: "2026-01-01",
        amount: "33.33",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "sched-2",
        opportunity_id: "opp-1",
        month: "2026-02-01",
        amount: "33.33",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]

    mockFrom.mockImplementation(() => {
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        }),
      })
      return { select }
    })

    const { getCustomSchedule } = await import("../revenue-schedule")

    const rows = await getCustomSchedule("opp-1", defaultCtx)

    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe("sched-1")
    expect(rows[0].opportunityId).toBe("opp-1")
    expect(rows[0].month).toBe("2026-01-01")
    expect(rows[0].amount).toBe("33.33")
  })

  it("returns empty array when no rows exist", async () => {
    mockFrom.mockImplementation(() => {
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })
      return { select }
    })

    const { getCustomSchedule } = await import("../revenue-schedule")

    const rows = await getCustomSchedule("opp-nonexistent", defaultCtx)
    expect(rows).toEqual([])
  })

  it("throws on database error", async () => {
    mockFrom.mockImplementation(() => {
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      })
      return { select }
    })

    const { getCustomSchedule } = await import("../revenue-schedule")

    await expect(getCustomSchedule("opp-1", defaultCtx)).rejects.toThrow("Failed to load revenue schedule")
  })
})

describe("saveCustomSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects when months sum does not equal opportunity amount", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "opportunities") {
        const select = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { amount: 500.00, currency: "USD" }, error: null }),
          }),
        })
        return { select }
      }
      if (table === "opportunity_revenue_schedule") {
        const del = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        return { delete: del }
      }
      return {}
    })

    const { saveCustomSchedule } = await import("../revenue-schedule")

    await expect(
      saveCustomSchedule("opp-1", [
        { month: "2026-01-01", amount: "300.00" },
        { month: "2026-02-01", amount: "100.00" },
      ], defaultCtx),
    ).rejects.toThrow("Schedule months sum")
  })

  it("replaces the schedule via the atomic RPC when months sum matches", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "opportunities") {
        const select = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { amount: 300.00, currency: "USD" }, error: null }),
          }),
        })
        return { select }
      }
      return {}
    })

    mockRpc.mockResolvedValue({ error: null })

    const { saveCustomSchedule } = await import("../revenue-schedule")

    await expect(
      saveCustomSchedule("opp-1", [
        { month: "2026-01-01", amount: "100.00" },
        { month: "2026-02-01", amount: "100.00" },
        { month: "2026-03-01", amount: "100.00" },
      ], defaultCtx),
    ).resolves.toBeUndefined()

    // Single atomic call — no separate delete/insert round-trips.
    expect(mockRpc).toHaveBeenCalledWith("replace_revenue_schedule", {
      _opportunity_id: "opp-1",
      _rows: [
        { month: "2026-01-01", amount: "100.00" },
        { month: "2026-02-01", amount: "100.00" },
        { month: "2026-03-01", amount: "100.00" },
      ],
    })
  })

  it("clears schedule when empty months array passed (RPC with empty rows)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "opportunities") {
        const select = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { amount: 0, currency: "USD" }, error: null }),
          }),
        })
        return { select }
      }
      return {}
    })

    mockRpc.mockResolvedValue({ error: null })

    const { saveCustomSchedule } = await import("../revenue-schedule")

    await expect(
      saveCustomSchedule("opp-1", [], defaultCtx),
    ).resolves.toBeUndefined()

    expect(mockRpc).toHaveBeenCalledWith("replace_revenue_schedule", {
      _opportunity_id: "opp-1",
      _rows: [],
    })
  })

  it("throws when the atomic RPC returns an error", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "opportunities") {
        const select = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { amount: 100.00, currency: "USD" }, error: null }),
          }),
        })
        return { select }
      }
      return {}
    })

    mockRpc.mockResolvedValue({ error: { message: "insufficient_privilege" } })

    const { saveCustomSchedule } = await import("../revenue-schedule")

    await expect(
      saveCustomSchedule("opp-1", [{ month: "2026-01-01", amount: "100.00" }], defaultCtx),
    ).rejects.toThrow("Failed to save revenue schedule")
  })

  it("rejects when opportunity is not found", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "opportunities") {
        const select = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
          }),
        })
        return { select }
      }
      return {}
    })

    const { saveCustomSchedule } = await import("../revenue-schedule")

    await expect(
      saveCustomSchedule("opp-nonexistent", [
        { month: "2026-01-01", amount: "100.00" },
      ], defaultCtx),
    ).rejects.toThrow("Opportunity not found")
  })

  it("cancels save when sum has rounding mismatch", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "opportunities") {
        const select = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { amount: 1.00, currency: "USD" }, error: null }),
          }),
        })
        return { select }
      }
      return {}
    })

    const { saveCustomSchedule } = await import("../revenue-schedule")

    await expect(
      saveCustomSchedule("opp-1", [
        { month: "2026-01-01", amount: "0.33" },
        { month: "2026-02-01", amount: "0.33" },
        { month: "2026-03-01", amount: "0.33" },
      ], defaultCtx),
    ).rejects.toThrow("Schedule months sum")
  })
})
