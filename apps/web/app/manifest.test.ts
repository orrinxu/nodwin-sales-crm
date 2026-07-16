import { describe, it, expect } from "vitest"
import manifest from "./manifest"
import { PWA_THEME_COLOR } from "@/lib/pwa/brand-color"

describe("web app manifest (ORR-705)", () => {
  const m = manifest()

  it("is an installable standalone app scoped to the root", () => {
    expect(m.display).toBe("standalone")
    expect(m.start_url).toBe("/")
    expect(m.scope).toBe("/")
  })

  it("uses the resolved brand primary as the theme colour", () => {
    expect(m.theme_color).toBe(PWA_THEME_COLOR)
  })

  it("declares both any and maskable icons at install sizes", () => {
    const purposes = m.icons?.map((i) => i.purpose)
    expect(purposes).toContain("maskable")
    // Chrome's installability check needs a 192 and a 512 icon.
    const sizes = m.icons?.map((i) => i.sizes)
    expect(sizes).toContain("192x192")
    expect(sizes).toContain("512x512")
  })

  it("points every icon at an asset shipped in public/", () => {
    for (const icon of m.icons ?? []) {
      expect(icon.src).toMatch(/^\/icon-.*\.png$/)
    }
  })
})
