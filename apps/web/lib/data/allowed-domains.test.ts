import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}))
vi.mock("../security/env", () => ({
  env: {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "eyjrole.abcdef456",
  },
}))

import { normalizeDomain, allowedDomainCreateSchema } from "./allowed-domains"

describe("normalizeDomain", () => {
  it("lowercases and trims", () => {
    expect(normalizeDomain("  Nodwin.COM  ")).toBe("nodwin.com")
  })

  it("strips a leading @", () => {
    expect(normalizeDomain("@nodwin.com")).toBe("nodwin.com")
  })

  it("strips a pasted scheme and path", () => {
    expect(normalizeDomain("https://Nodwin.com/some/path")).toBe("nodwin.com")
  })

  it("strips a trailing path without a scheme", () => {
    expect(normalizeDomain("maxlevel.gg/careers")).toBe("maxlevel.gg")
  })
})

describe("allowedDomainCreateSchema", () => {
  it("accepts and normalizes a valid domain", () => {
    expect(allowedDomainCreateSchema.parse({ domain: "  TrinityGaming.in " })).toEqual({
      domain: "trinitygaming.in",
    })
  })

  it("accepts a multi-label domain", () => {
    expect(allowedDomainCreateSchema.parse({ domain: "mail.nodwin.co.uk" })).toEqual({
      domain: "mail.nodwin.co.uk",
    })
  })

  it("rejects a bare hostname with no TLD", () => {
    expect(() => allowedDomainCreateSchema.parse({ domain: "nodwin" })).toThrow()
  })

  it("rejects an email address", () => {
    expect(() => allowedDomainCreateSchema.parse({ domain: "user@nodwin.com" })).toThrow()
  })

  it("rejects an empty value", () => {
    expect(() => allowedDomainCreateSchema.parse({ domain: "   " })).toThrow()
  })

  it("rejects a domain with a space", () => {
    expect(() => allowedDomainCreateSchema.parse({ domain: "nod win.com" })).toThrow()
  })
})
