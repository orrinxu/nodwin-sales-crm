import { describe, it, expect } from "vitest"

import {
  DEFAULT_THEME_MODE,
  SEEDED_THEME,
  resolveThemeMode,
  themeInjectionVars,
} from "@/lib/theme/theme-object"

describe("resolveThemeMode", () => {
  it("returns the explicit preference when it is light or dark", () => {
    expect(resolveThemeMode("light")).toBe("light")
    expect(resolveThemeMode("dark")).toBe("dark")
  })

  it("falls back to the seeded default for system/unknown/empty", () => {
    expect(resolveThemeMode("system")).toBe(DEFAULT_THEME_MODE)
    expect(resolveThemeMode(undefined)).toBe(DEFAULT_THEME_MODE)
    expect(resolveThemeMode(null)).toBe(DEFAULT_THEME_MODE)
    expect(resolveThemeMode("garbage")).toBe(DEFAULT_THEME_MODE)
    expect(DEFAULT_THEME_MODE).toBe("light")
  })
})

describe("themeInjectionVars", () => {
  it("emits BOTH light and dark brand vars so a class toggle switches modes", () => {
    const vars = themeInjectionVars()
    // A representative sample of each mode must be present.
    expect(vars["--brand-primary-light"]).toBe(SEEDED_THEME.light.primary)
    expect(vars["--brand-primary-dark"]).toBe(SEEDED_THEME.dark.primary)
    expect(vars["--brand-ring-light"]).toBe(SEEDED_THEME.light.ring)
    expect(vars["--brand-ring-dark"]).toBe(SEEDED_THEME.dark.ring)
    expect(vars["--brand-sidebar-primary-dark"]).toBe(
      SEEDED_THEME.dark.sidebarPrimary,
    )
  })

  it("emits one var per brand field per mode (8 fields x 2 modes)", () => {
    const keys = Object.keys(themeInjectionVars())
    expect(keys).toHaveLength(16)
    expect(keys.filter((k) => k.endsWith("-light"))).toHaveLength(8)
    expect(keys.filter((k) => k.endsWith("-dark"))).toHaveLength(8)
  })
})
