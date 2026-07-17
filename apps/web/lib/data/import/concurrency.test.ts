import { describe, it, expect, vi } from "vitest"
import { runWithConcurrency } from "./concurrency"

describe("runWithConcurrency", () => {
  it("preserves input order in the results", async () => {
    const items = [1, 2, 3, 4, 5]
    const settled = await runWithConcurrency(items, 2, async (n) => n * 10)
    expect(settled.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([
      10, 20, 30, 40, 50,
    ])
  })

  it("never runs more than `limit` at once", async () => {
    let inFlight = 0
    let peak = 0
    await runWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it("isolates rejections per item (allSettled semantics), never throwing", async () => {
    const settled = await runWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom-2")
      return n
    })
    expect(settled[0]).toMatchObject({ status: "fulfilled", value: 1 })
    expect(settled[1].status).toBe("rejected")
    expect(settled[2]).toMatchObject({ status: "fulfilled", value: 3 })
  })

  it("runs every item exactly once", async () => {
    const fn = vi.fn(async (n: number) => n)
    await runWithConcurrency([1, 2, 3, 4], 10, fn)
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it("handles an empty list", async () => {
    expect(await runWithConcurrency([], 4, async () => 1)).toEqual([])
  })
})
