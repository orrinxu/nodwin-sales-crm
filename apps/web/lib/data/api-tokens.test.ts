import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "svc-key",
    SUPABASE_ANON_KEY: "anon-key",
  },
}))

// The service-role client used by resolveApiToken (built via @supabase/ssr).
let tokenRow: Record<string, unknown> | null = null
const updateEq = vi.fn().mockResolvedValue({ error: null })

function builder() {
  const b: Record<string, unknown> = {
    select: () => b,
    update: () => b,
    eq: (_col: string, _val: string) => (b.__afterUpdate ? updateEq() : b),
    maybeSingle: () => Promise.resolve({ data: tokenRow, error: null }),
  }
  // update(...).eq(...) resolves; select(...).eq(...).maybeSingle() reads.
  b.update = () => {
    b.__afterUpdate = true
    return b
  }
  return b
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ from: () => builder() }),
}))
// createServerClient from our server module isn't exercised by resolveApiToken.
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

const PREFIX = "nodpat_"
const hash = (s: string) => createHash("sha256").update(s).digest("hex")

beforeEach(() => {
  vi.clearAllMocks()
  tokenRow = null
})

describe("resolveApiToken", () => {
  it("rejects a token without the expected prefix", async () => {
    const { resolveApiToken } = await import("./api-tokens")
    expect(await resolveApiToken("sk-live-nope")).toBeNull()
  })

  it("returns null when no row matches the hash", async () => {
    tokenRow = null
    const { resolveApiToken } = await import("./api-tokens")
    expect(await resolveApiToken(`${PREFIX}unknown`)).toBeNull()
  })

  it("resolves a valid token to its user id and bumps last_used_at", async () => {
    const token = `${PREFIX}validsecret`
    tokenRow = { id: "tok-1", user_id: "u-1", token_hash: hash(token), revoked_at: null, expires_at: null }
    const { resolveApiToken } = await import("./api-tokens")
    const res = await resolveApiToken(token)
    expect(res).toEqual({ userId: "u-1", tokenId: "tok-1" })
    expect(updateEq).toHaveBeenCalledTimes(1) // last_used_at bump
  })

  it("rejects a revoked token", async () => {
    const token = `${PREFIX}revoked`
    tokenRow = { id: "t", user_id: "u", token_hash: hash(token), revoked_at: "2026-01-01T00:00:00Z", expires_at: null }
    const { resolveApiToken } = await import("./api-tokens")
    expect(await resolveApiToken(token)).toBeNull()
  })

  it("rejects an expired token", async () => {
    const token = `${PREFIX}expired`
    tokenRow = { id: "t", user_id: "u", token_hash: hash(token), revoked_at: null, expires_at: "2000-01-01T00:00:00Z" }
    const { resolveApiToken } = await import("./api-tokens")
    expect(await resolveApiToken(token)).toBeNull()
  })
})
