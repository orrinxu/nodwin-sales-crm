import { describe, it, expect } from "vitest"

import { buildRoleMatrix, togglePermission, dirtyRoleIds } from "./role-matrix"

describe("buildRoleMatrix", () => {
  it("groups rows by role and seeds empty sets for every roleId", () => {
    const m = buildRoleMatrix(
      [
        { roleId: "a", permissionKey: "x" },
        { roleId: "a", permissionKey: "y" },
      ],
      ["a", "b"],
    )
    expect([...(m.get("a") ?? [])].sort()).toEqual(["x", "y"])
    expect([...(m.get("b") ?? [])]).toEqual([])
  })
})

describe("togglePermission", () => {
  it("adds then removes, immutably", () => {
    const m0 = buildRoleMatrix([], ["a"])
    const m1 = togglePermission(m0, "a", "x")
    expect(m1.get("a")?.has("x")).toBe(true)
    expect(m0.get("a")?.has("x")).toBe(false) // original untouched
    const m2 = togglePermission(m1, "a", "x")
    expect(m2.get("a")?.has("x")).toBe(false)
  })
})

describe("dirtyRoleIds", () => {
  it("reports only the roles whose set changed", () => {
    const base = buildRoleMatrix([{ roleId: "a", permissionKey: "x" }], ["a", "b"])
    const cur = togglePermission(base, "a", "y")
    expect(dirtyRoleIds(base, cur)).toEqual(["a"])
  })

  it("is empty when identical", () => {
    const base = buildRoleMatrix([{ roleId: "a", permissionKey: "x" }], ["a"])
    const same = buildRoleMatrix([{ roleId: "a", permissionKey: "x" }], ["a"])
    expect(dirtyRoleIds(base, same)).toEqual([])
  })
})
