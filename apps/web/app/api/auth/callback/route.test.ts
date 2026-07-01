import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockExchangeCodeForSession = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockRpc = vi.fn()

const mockClient = {
  auth: {
    exchangeCodeForSession: mockExchangeCodeForSession,
    getUser: mockGetUser,
    signOut: mockSignOut,
  },
  rpc: mockRpc,
}

// The callback now delegates the domain decision to the is_email_domain_allowed
// RPC. Mirror the allow-list here so these integration tests exercise the
// callback's allow/reject/redirect behaviour; the RPC's own logic (case, multi-@,
// malformed) is tested authoritatively in supabase/tests/auth_domain_check.test.sql.
const ALLOWED = ["nodwin.com", "trinitygaming.in", "maxlevel.gg"]
function domainAllowedMock(_fn: string, args?: { _email?: string }) {
  const m = /^[^@]+@([^@]+)$/.exec(args?._email ?? "")
  const domain = m?.[1]?.toLowerCase()
  return Promise.resolve({ data: domain ? ALLOWED.includes(domain) : false, error: null })
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => mockClient),
}))

vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "eyjanon.abcdef123",
    APP_URL: "https://crm.nodwin.com",
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockExchangeCodeForSession.mockReset()
  mockGetUser.mockReset()
  mockSignOut.mockReset()
  mockRpc.mockReset()
  mockRpc.mockImplementation(domainAllowedMock)
})

describe("GET /api/auth/callback", () => {
  it("redirects to next when domain is allowed", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@nodwin.com" } },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc&next=/dashboard",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("defaults to /dashboard when next is missing", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@nodwin.com" } },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("blocks absolute URL open redirects", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@nodwin.com" } },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc&next=https://evil.com",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("blocks protocol-relative open redirects", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@nodwin.com" } },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc&next=//evil.com",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("redirects to login when code is missing", async () => {
    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?next=/dashboard",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://crm.nodwin.com/login?error=missing_code",
    )
  })

  it("redirects to login when auth exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid code" },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=bad&next=/dashboard",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://crm.nodwin.com/login?error=auth_failed&message=Invalid%20code",
    )
  })

  it("redirects to login with disallowed_domain when email domain is not allowed", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@gmail.com" } },
    })
    mockSignOut.mockResolvedValue({ error: null })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://crm.nodwin.com/login?error=disallowed_domain",
    )
  })

  it("allows trinitygaming.in domain", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@trinitygaming.in" } },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("allows maxlevel.gg domain", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@maxlevel.gg" } },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("rejects disallowed domain and signs user out", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@unauthorized.com" } },
    })
    mockSignOut.mockResolvedValue({ error: null })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://crm.nodwin.com/login?error=disallowed_domain",
    )
  })

  it("rejects user with no email", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: undefined } },
    })
    mockSignOut.mockResolvedValue({ error: null })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://crm.nodwin.com/login?error=disallowed_domain",
    )
  })

  it("rejects security bypass attempt with embedded @ in local part", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@evil.com@nodwin.com" } },
    })
    mockSignOut.mockResolvedValue({ error: null })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://crm.nodwin.com/login?error=disallowed_domain",
    )
  })

  it("allows case-insensitive domain match", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "user@NoDwin.com" } },
    })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("rejects malformed email with no local part", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { email: "@nodwin.com" } },
    })
    mockSignOut.mockResolvedValue({ error: null })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://crm.nodwin.com/login?error=disallowed_domain",
    )
  })
})
