import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { resolveExtractedAccount, type AccountResolverDeps } from "./account-extraction-resolver"

const ctx = { user: { id: "u1", email: "a@nodwin.com", role: "sales_rep" }, source: "web" as const }

function fld(value: string) {
  return { value, confidence: 0.9, source: `src:${value}` }
}

describe("resolveExtractedAccount", () => {
  it("passes non-name fields through as ok and flags a name that already exists (dedup)", async () => {
    const deps: AccountResolverDeps = { searchAccounts: async () => [{ id: "a1", name: "Acme Media" }] }
    const res = await resolveExtractedAccount(
      ctx,
      { name: fld("Acme Media"), website: fld("acme.com"), industry: fld("Media") },
      deps,
    )
    expect(res.prefill.name).toBe("Acme Media")
    expect(res.prefill.website).toBe("acme.com")
    expect(res.prefill.industry).toBe("Media")
    // dedup: an existing account matched → ambiguous + candidate + a warning note
    expect(res.resolution.name.status).toBe("ambiguous")
    expect(res.resolution.name.candidates?.[0]).toEqual({ id: "a1", label: "Acme Media" })
    expect(res.notes.some((n) => /already exist/i.test(n))).toBe(true)
    // passthrough fields are ok
    expect(res.resolution.website.status).toBe("ok")
    expect(res.resolution.industry.status).toBe("ok")
  })

  it("marks a genuinely new name ok when nothing matches, with no note", async () => {
    const deps: AccountResolverDeps = { searchAccounts: async () => [] }
    const res = await resolveExtractedAccount(ctx, { name: fld("Brand New Co") }, deps)
    expect(res.resolution.name.status).toBe("ok")
    expect(res.notes).toEqual([])
  })

  it("dedup match is normalized (case/space-insensitive)", async () => {
    const deps: AccountResolverDeps = { searchAccounts: async () => [{ id: "a1", name: "ACME  media" }] }
    const res = await resolveExtractedAccount(ctx, { name: fld("Acme Media") }, deps)
    expect(res.resolution.name.status).toBe("ambiguous")
  })
})
