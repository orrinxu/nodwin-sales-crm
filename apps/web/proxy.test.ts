import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetUser = vi.fn()
const mockCreateServerClient = vi.fn(() => ({
  auth: { getUser: mockGetUser },
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock("next/server", async () => {
  const actual = await vi.importActual("next/server")
  return {
    ...actual,
    NextResponse: {
      next: () => ({
        cookies: { set: vi.fn() },
        status: 200,
      }),
      redirect: (url: URL) => ({
        url: url.toString(),
        status: 302,
        cookies: { set: vi.fn() },
      }),
    },
  }
})

function createMockRequest(pathname: string) {
  const searchParams = new URLSearchParams()
  return {
    nextUrl: {
      pathname,
      searchParams,
      clone: () => {
        const clonedParams = new URLSearchParams(searchParams.toString())
        return {
          pathname: "/login",
          searchParams: clonedParams,
          toString: () => {
            const qs = clonedParams.toString()
            return qs
              ? `http://localhost:3000/login?${qs}`
              : `http://localhost:3000/login`
          },
        }
      },
      toString: () => `http://localhost:3000${pathname}`,
    },
    cookies: {
      getAll: () => [],
    },
  } as unknown as import("next/server").NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("proxy", () => {
  it("allows public routes without auth check", async () => {
    const { proxy } = await import("./proxy")
    const request = createMockRequest("/login")
    const response = await proxy(request)
    expect(mockCreateServerClient).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })

  it("allows protected routes for authenticated users", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null })
    const { proxy } = await import("./proxy")
    const request = createMockRequest("/dashboard")
    const response = await proxy(request)
    expect(mockCreateServerClient).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
  })

  it("redirects unauthenticated users on protected routes to login", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const { proxy } = await import("./proxy")
    const request = createMockRequest("/dashboard")
    const response = await proxy(request)
    expect(response.status).toBe(302)
    expect((response as { url: string }).url).toContain("/login")
  })

  it("preserves original path as next param when redirecting", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const { proxy } = await import("./proxy")
    const request = createMockRequest("/settings/profile")
    const response = await proxy(request)
    expect(response.status).toBe(302)
    const url = (response as { url: string }).url
    expect(url).toContain("/login")
    expect(url).toContain("next=%2Fsettings%2Fprofile")
  })

  it("redirects when getUser throws an error", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("expired") })
    const { proxy } = await import("./proxy")
    const request = createMockRequest("/admin")
    const response = await proxy(request)
    expect(response.status).toBe(302)
    expect((response as { url: string }).url).toContain("/login")
  })

  it("protects /admin prefix", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const { proxy } = await import("./proxy")
    const request = createMockRequest("/admin/users")
    const response = await proxy(request)
    expect(response.status).toBe(302)
  })

  it("protects /settings prefix", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const { proxy } = await import("./proxy")
    const request = createMockRequest("/settings")
    const response = await proxy(request)
    expect(response.status).toBe(302)
  })
})
