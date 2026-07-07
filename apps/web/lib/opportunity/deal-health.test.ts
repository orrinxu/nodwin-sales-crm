import { describe, it, expect } from "vitest"
import {
  computeDealHealth,
  daysSinceActivity,
  hasHealthSignal,
  overdueLabel,
  staleLabel,
} from "./deal-health"

const NOW = new Date("2026-07-05T12:00:00.000Z").getTime()
const DAY = 86_400_000
function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString()
}

describe("daysSinceActivity", () => {
  it("uses MAX(activity) when present", () => {
    expect(
      daysSinceActivity({ lastActivityMs: NOW - 30 * DAY, createdAt: daysAgo(90), nowMs: NOW }),
    ).toBe(30)
  })

  it("ages a zero-activity deal from created_at (never treats it as fresh)", () => {
    expect(
      daysSinceActivity({ lastActivityMs: null, createdAt: daysAgo(40), nowMs: NOW }),
    ).toBe(40)
  })

  it("never returns negative for a future baseline", () => {
    expect(
      daysSinceActivity({ lastActivityMs: NOW + 5 * DAY, createdAt: daysAgo(1), nowMs: NOW }),
    ).toBe(0)
  })
})

describe("computeDealHealth — overdue", () => {
  it("flags an open deal past its close_date with the day count", () => {
    const h = computeDealHealth({
      stage: "qualify",
      closeDate: "2026-06-30", // 5 days before NOW
      createdAt: daysAgo(1),
      lastActivityMs: NOW - DAY,
      thresholdDays: 21,
      nowMs: NOW,
    })
    expect(h.overdue).toEqual({ days: 5 })
  })

  it("does not flag a deal whose close_date is today or future", () => {
    expect(
      computeDealHealth({
        stage: "qualify",
        closeDate: "2026-07-05",
        createdAt: daysAgo(1),
        lastActivityMs: NOW - DAY,
        thresholdDays: 21,
        nowMs: NOW,
      }).overdue,
    ).toBeNull()
    expect(
      computeDealHealth({
        stage: "qualify",
        closeDate: "2026-12-01",
        createdAt: daysAgo(1),
        lastActivityMs: NOW - DAY,
        thresholdDays: 21,
        nowMs: NOW,
      }).overdue,
    ).toBeNull()
  })

  it("does not flag a deal with no close_date", () => {
    expect(
      computeDealHealth({
        stage: "qualify",
        closeDate: null,
        createdAt: daysAgo(1),
        lastActivityMs: NOW - DAY,
        thresholdDays: 21,
        nowMs: NOW,
      }).overdue,
    ).toBeNull()
  })

  it("handles a full ISO close_date by comparing the date part", () => {
    const h = computeDealHealth({
      stage: "negotiate",
      closeDate: "2026-07-02T23:59:00.000Z",
      createdAt: daysAgo(1),
      lastActivityMs: NOW - DAY,
      thresholdDays: 7,
      nowMs: NOW,
    })
    expect(h.overdue).toEqual({ days: 3 })
  })
})

describe("computeDealHealth — stale", () => {
  it("flags a deal quiet past its per-stage threshold", () => {
    const h = computeDealHealth({
      stage: "negotiate", // threshold 7 in these tests
      closeDate: null,
      createdAt: daysAgo(90),
      lastActivityMs: NOW - 30 * DAY,
      thresholdDays: 7,
      nowMs: NOW,
    })
    expect(h.stale).toEqual({ days: 30, thresholdDays: 7 })
  })

  it("does not flag a deal within its threshold", () => {
    const h = computeDealHealth({
      stage: "qualify",
      closeDate: null,
      createdAt: daysAgo(90),
      lastActivityMs: NOW - 5 * DAY,
      thresholdDays: 21,
      nowMs: NOW,
    })
    expect(h.stale).toBeNull()
  })

  it("flags exactly at the threshold boundary (>=)", () => {
    const h = computeDealHealth({
      stage: "propose",
      closeDate: null,
      createdAt: daysAgo(90),
      lastActivityMs: NOW - 10 * DAY,
      thresholdDays: 10,
      nowMs: NOW,
    })
    expect(h.stale).toEqual({ days: 10, thresholdDays: 10 })
  })

  it("ages a zero-activity deal from created_at when computing staleness", () => {
    const h = computeDealHealth({
      stage: "propose",
      closeDate: null,
      createdAt: daysAgo(40),
      lastActivityMs: null,
      thresholdDays: 10,
      nowMs: NOW,
    })
    expect(h.stale).toEqual({ days: 40, thresholdDays: 10 })
  })

  it("disables the stale signal when no threshold is provided", () => {
    const h = computeDealHealth({
      stage: "qualify",
      closeDate: null,
      createdAt: daysAgo(400),
      lastActivityMs: null,
      thresholdDays: undefined,
      nowMs: NOW,
    })
    expect(h.stale).toBeNull()
  })
})

describe("computeDealHealth — terminal deals", () => {
  it("never flags a closed_won deal", () => {
    const h = computeDealHealth({
      stage: "closed_won",
      closeDate: "2026-01-01",
      createdAt: daysAgo(400),
      lastActivityMs: null,
      thresholdDays: 21,
      nowMs: NOW,
    })
    expect(h).toEqual({ overdue: null, stale: null })
  })

  it("never flags a closed_lost deal", () => {
    const h = computeDealHealth({
      stage: "closed_lost",
      closeDate: "2026-01-01",
      createdAt: daysAgo(400),
      lastActivityMs: null,
      thresholdDays: 21,
      nowMs: NOW,
    })
    expect(h).toEqual({ overdue: null, stale: null })
  })
})

describe("computeDealHealth — combined", () => {
  it("can flag overdue AND stale on the same deal", () => {
    const h = computeDealHealth({
      stage: "negotiate",
      closeDate: "2026-06-30",
      createdAt: daysAgo(90),
      lastActivityMs: NOW - 30 * DAY,
      thresholdDays: 7,
      nowMs: NOW,
    })
    expect(h.overdue).toEqual({ days: 5 })
    expect(h.stale).toEqual({ days: 30, thresholdDays: 7 })
  })

  it("a fresh, on-time open deal has all-null health", () => {
    const h = computeDealHealth({
      stage: "qualify",
      closeDate: "2026-12-01",
      createdAt: daysAgo(2),
      lastActivityMs: NOW - DAY,
      thresholdDays: 21,
      nowMs: NOW,
    })
    expect(h).toEqual({ overdue: null, stale: null })
  })
})

describe("hasHealthSignal / labels", () => {
  it("hasHealthSignal reflects presence of any signal", () => {
    expect(hasHealthSignal(null)).toBe(false)
    expect(hasHealthSignal(undefined)).toBe(false)
    expect(hasHealthSignal({ overdue: null, stale: null })).toBe(false)
    expect(hasHealthSignal({ overdue: { days: 1 }, stale: null })).toBe(true)
    expect(hasHealthSignal({ overdue: null, stale: { days: 8, thresholdDays: 7 } })).toBe(true)
  })

  it("formats labels", () => {
    expect(overdueLabel(5)).toBe("5d overdue")
    expect(staleLabel(12)).toBe("12d no activity")
  })
})
