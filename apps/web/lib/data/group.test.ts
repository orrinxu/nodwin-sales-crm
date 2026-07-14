import { describe, it, expect } from "vitest"
import { getGroupScope } from "./group"
import type { DashboardContext } from "@/lib/data/metrics"

function ctx(role: string | undefined): DashboardContext {
  return { user: { role }, source: "web" } as unknown as DashboardContext
}

describe("getGroupScope", () => {
  it("gives exec and group_sales_lead a group-wide rollup", () => {
    expect(getGroupScope(ctx("exec"))).toEqual({ canViewGroup: true, tier: "group" })
    expect(getGroupScope(ctx("group_sales_lead"))).toEqual({ canViewGroup: true, tier: "group" })
  })

  it("gives a regional_head a region-scoped rollup", () => {
    expect(getGroupScope(ctx("regional_head"))).toEqual({ canViewGroup: true, tier: "region" })
  })

  it("locks the Group tab for non-leadership roles", () => {
    for (const role of ["sales_rep", "sales_manager", "admin", "finance", undefined]) {
      expect(getGroupScope(ctx(role))).toEqual({ canViewGroup: false, tier: null })
    }
  })
})
