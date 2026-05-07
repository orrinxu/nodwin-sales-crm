import { describe, it, expect } from "vitest"
import { adminNavItems } from "./admin-nav"

describe("adminNavItems", () => {
  it("contains all expected admin navigation sections", () => {
    const titles = adminNavItems.map((i) => i.title)
    expect(titles).toEqual([
      "Overview",
      "Users",
      "Settings",
      "Audit Log",
    ])
  })

  it("each item has a valid admin path", () => {
    for (const item of adminNavItems) {
      expect(item.href).toMatch(/^\/admin(?:\/[a-z-]+)?$/)
    }
  })

  it("each item has a unique href", () => {
    const hrefs = adminNavItems.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("each item has an icon defined", () => {
    for (const item of adminNavItems) {
      expect(item.icon).toBeDefined()
    }
  })

  it("Overview is the first item (admin landing)", () => {
    expect(adminNavItems[0].title).toBe("Overview")
    expect(adminNavItems[0].href).toBe("/admin")
  })
})
