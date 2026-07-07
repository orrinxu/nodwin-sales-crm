import { describe, it, expect } from "vitest"

import {
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSION_KEYS,
  isPermissionKey,
} from "./permissions"

describe("permission catalogue", () => {
  it("keys are unique and well-formed category.action", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
    }
  })

  it("every permission's category is in PERMISSION_CATEGORIES", () => {
    for (const p of PERMISSIONS) {
      expect(PERMISSION_CATEGORIES).toContain(p.category)
    }
  })

  it("isPermissionKey accepts catalogue keys and rejects others", () => {
    expect(isPermissionKey("opportunities.delete")).toBe(true)
    expect(isPermissionKey("admin.manage_roles")).toBe(true)
    expect(isPermissionKey("bogus.key")).toBe(false)
    expect(isPermissionKey("opportunities")).toBe(false)
  })
})
