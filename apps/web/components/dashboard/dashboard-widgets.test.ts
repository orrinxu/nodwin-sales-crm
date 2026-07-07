import { describe, it, expect } from "vitest"

import { mergeLayout, defaultLayout, DASHBOARD_WIDGETS } from "./dashboard-widgets"

const specs = [
  { id: "a", title: "A", defaultColSpan: 12, defaultRowSpan: 2 },
  { id: "b", title: "B", defaultColSpan: 6, defaultRowSpan: 3 },
  { id: "c", title: "C", defaultColSpan: 6, defaultRowSpan: 3 },
]

describe("mergeLayout", () => {
  it("returns the default layout when nothing is saved", () => {
    expect(mergeLayout(null, specs)).toEqual([
      { id: "a", colSpan: 12, rowSpan: 2 },
      { id: "b", colSpan: 6, rowSpan: 3 },
      { id: "c", colSpan: 6, rowSpan: 3 },
    ])
    expect(mergeLayout([], specs)).toEqual(defaultLayout(specs))
  })

  it("keeps saved order and spans, appending widgets added since", () => {
    const saved = [
      { id: "c", colSpan: 4, rowSpan: 5 },
      { id: "a", colSpan: 8, rowSpan: 2 },
    ]
    const merged = mergeLayout(saved, specs)
    expect(merged.map((m) => m.id)).toEqual(["c", "a", "b"]) // b appended
    expect(merged[0]).toEqual({ id: "c", colSpan: 4, rowSpan: 5 })
  })

  it("drops unknown saved ids and de-dupes (first wins)", () => {
    const saved = [
      { id: "ghost", colSpan: 6, rowSpan: 2 },
      { id: "a", colSpan: 3, rowSpan: 2 },
      { id: "a", colSpan: 9, rowSpan: 2 },
    ]
    const merged = mergeLayout(saved, specs)
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"])
    expect(merged.find((m) => m.id === "a")!.colSpan).toBe(3)
  })

  it("clamps spans to 1..12", () => {
    const merged = mergeLayout([{ id: "a", colSpan: 99, rowSpan: 0 }], specs)
    expect(merged[0]).toEqual({ id: "a", colSpan: 12, rowSpan: 1 })
  })

  it("real catalogue: default has one entry per widget", () => {
    expect(mergeLayout(null)).toHaveLength(DASHBOARD_WIDGETS.length)
  })
})
