import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockExchangeCodeForSession = vi.fn()

const mockClient = {
  auth: { exchangeCodeForSession: mockExchangeCodeForSession },
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
})

describe("GET /api/auth/callback", () => {
  it("redirects to next when path is safe relative", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

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

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc&next=//evil.com",
    )
    const response = await GET(request as unknown as import("next/server").NextRequest)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://crm.nodwin.com/dashboard")
  })

  it("blocks backslash-based open redirects", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })

    const { GET } = await import("./route")
    const request = new Request(
      "https://crm.nodwin.com/api/auth/callback?code=abc&next=/\\evil.com",
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
})
