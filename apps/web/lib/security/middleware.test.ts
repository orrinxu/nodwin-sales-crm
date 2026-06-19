import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetUser = vi.fn()
const mockClient = { auth: { getUser: mockGetUser } }

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => mockClient),
}))

vi.mock("next/server", () => {
  const nextRes = {
    redirect: (url: URL) => Response.redirect(url.toString(), 307),
    next: () => {
      const res = new Response(null, { status: 200 })
      Object.defineProperty(res, "cookies", {
        value: { set: () => {} },
        writable: true,
      })
      return res
    },
  }
  return { NextResponse: nextRes }
})

function createMockRequest(
  pathname: string,
): import("next/server").NextRequest {
  const url = new URL(`http://localhost:3000${pathname}`)
  return {
    nextUrl: url,
    url: url.toString(),
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
    headers: new Headers(),
  } as unknown as import("next/server").NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mockGetUser.mockReset()
  vi.stubEnv("SUPABASE_URL", "http://localhost:54321")
  vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
  vi.stubEnv("POSTMARK_WEBHOOK_SECRET", "test-webhook-secret")
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3000/api")
  vi.stubEnv("NODE_ENV", "production")
})

describe("middleware", () => {
  it("redirects / to /dashboard regardless of auth state", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    )
  })

  it("redirects unauthenticated user on /contacts to /login?next=/contacts", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/contacts"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fcontacts",
    )
  })

  it("redirects authenticated user on /login to /dashboard", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/login"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    )
  })

  it("allows unauthenticated user to reach /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/login"))
    expect(res.status).toBe(200)
  })

  it("allows authenticated user to reach /dashboard", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/dashboard"))
    expect(res.status).toBe(200)
  })

  it("allows authenticated user to reach /contacts", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/contacts"))
    expect(res.status).toBe(200)
  })

  it("does not redirect unauthenticated user on / to /dashboard with / path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    )
  })
})

describe("middleware local-preview", () => {
  it("bypasses auth in local preview mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENV", "local-preview")
    vi.stubEnv("NODE_ENV", "development")
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/contacts"))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it("does not bypass auth in production even with local-preview env", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENV", "local-preview")
    vi.stubEnv("NODE_ENV", "production")
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const { middleware } = await import("../../middleware")
    const res = await middleware(createMockRequest("/contacts"))
    expect(res.status).toBe(307)
    vi.unstubAllEnvs()
  })
})
