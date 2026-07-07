import { describe, it, expect } from "vitest"

import { rankLeaderboard } from "./rep-leaderboard-data"
import type { RepScorecardRow } from "@/lib/data/forecast"

function row(
  o: Partial<RepScorecardRow> & { ownerId: string | null; ownerName: string },
): RepScorecardRow {
  return {
    openPipeline: 0,
    weightedPipeline: 0,
    won: 0,
    winRate: null,
    avgSalesCycleDays: null,
    ...o,
  }
}

describe("rankLeaderboard", () => {
  it("ranks by the chosen metric (desc), assigns rank and pctOfLeader", () => {
    const rows = [
      row({ ownerId: "a", ownerName: "Alice", won: 100 }),
      row({ ownerId: "b", ownerName: "Bob", won: 300 }),
      row({ ownerId: "c", ownerName: "Cara", won: 200 }),
    ]
    const e = rankLeaderboard(rows, "won", "a")
    expect(e.map((x) => x.ownerName)).toEqual(["Bob", "Cara", "Alice"])
    expect(e.map((x) => x.rank)).toEqual([1, 2, 3])
    expect(e[0].pctOfLeader).toBe(100)
    expect(e[1].pctOfLeader).toBe(67) // round(200/300 × 100)
    expect(e[2].pctOfLeader).toBe(33) // round(100/300 × 100)
    expect(e.find((x) => x.ownerName === "Alice")!.isCurrentUser).toBe(true)
    expect(e.find((x) => x.ownerName === "Bob")!.isCurrentUser).toBe(false)
  })

  it("drops unassigned (null-owner) rows", () => {
    const rows = [
      row({ ownerId: null, ownerName: "Unassigned", won: 999 }),
      row({ ownerId: "a", ownerName: "Alice", won: 100 }),
    ]
    const e = rankLeaderboard(rows, "won", "a")
    expect(e).toHaveLength(1)
    expect(e[0].ownerName).toBe("Alice")
  })

  it("breaks ties by name (ascending)", () => {
    const rows = [
      row({ ownerId: "z", ownerName: "Zed", won: 100 }),
      row({ ownerId: "m", ownerName: "Amy", won: 100 }),
    ]
    expect(rankLeaderboard(rows, "won", "x").map((x) => x.ownerName)).toEqual([
      "Amy",
      "Zed",
    ])
  })

  it("treats a null win rate as 0 when ranking by winRate", () => {
    const rows = [
      row({ ownerId: "a", ownerName: "Alice", winRate: 50 }),
      row({ ownerId: "b", ownerName: "Bob", winRate: null }),
      row({ ownerId: "c", ownerName: "Cara", winRate: 80 }),
    ]
    const e = rankLeaderboard(rows, "winRate", "a")
    expect(e.map((x) => [x.ownerName, x.value])).toEqual([
      ["Cara", 80],
      ["Alice", 50],
      ["Bob", 0],
    ])
  })

  it("caps the list at the limit", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ ownerId: `r${i}`, ownerName: `Rep ${i}`, won: i }),
    )
    expect(rankLeaderboard(rows, "won", "x", 3)).toHaveLength(3)
  })

  it("returns an empty list when there is nobody to rank", () => {
    expect(rankLeaderboard([], "won", "x")).toEqual([])
    expect(
      rankLeaderboard([row({ ownerId: null, ownerName: "Unassigned" })], "won", "x"),
    ).toEqual([])
  })
})
