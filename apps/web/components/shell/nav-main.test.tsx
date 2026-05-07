import { describe, it, expect } from "vitest"
import { mainNavItems } from "./nav-main"

describe("mainNavItems", () => {
  it("contains all expected navigation sections", () => {
    const titles = mainNavItems.map((i) => i.title)
    expect(titles).toEqual([
      "Dashboard",
      "Accounts",
      "Contacts",
      "Opportunities",
      "Admin",
    ])
  })

  it("each item has a valid path", () => {
    for (const item of mainNavItems) {
      expect(item.href).toMatch(/^\/[a-z]+$/)
    }
  })

  it("each item has a unique href", () => {
    const hrefs = mainNavItems.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("each item has an icon defined", () => {
    for (const item of mainNavItems) {
      expect(item.icon).toBeDefined()
    }
  })

  it("hrefs match expected dashboard and CRM paths", () => {
    const hrefs = mainNavItems.map((i) => i.href)
    expect(hrefs).toEqual([
      "/dashboard",
      "/accounts",
      "/contacts",
      "/opportunities",
      "/admin",
    ])
  })

  it("Dashboard is the first item (primary landing)", () => {
    expect(mainNavItems[0].title).toBe("Dashboard")
    expect(mainNavItems[0].href).toBe("/dashboard")
  })
})
