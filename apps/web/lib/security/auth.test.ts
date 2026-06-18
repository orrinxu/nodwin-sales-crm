import { describe, it, expect, vi, beforeEach } from "vitest"
import { UnauthorisedError, ForbiddenError } from "./errors"

const mockGetUser = vi.fn()

const mockClient = {
  auth: { getUser: mockGetUser },
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: vi.fn(() => []),
      set: vi.fn(),
    }),
  ),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => mockClient),
}))

vi.mock("./env", () => {
  const defaults: Record<string, string | undefined> = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "eyjanon.abcdef123",
    SUPABASE_SERVICE_ROLE_KEY: "eyjrole.abcdef456",
    APP_URL: "http://localhost:3000",
    POSTMARK_WEBHOOK_SECRET: "test-secret",
    NEXT_PUBLIC_API_URL: "http://localhost:3001/api",
  }
  /* eslint-disable security/detect-object-injection */
  return {
    env: new Proxy({} as Record<string, string | undefined>, {
      get(_, prop) {
        const key = String(prop)
        return process.env[key] ?? defaults[key]
      },
    }),
  }
  /* eslint-enable security/detect-object-injection */
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  mockGetUser.mockReset()
})

describe("requireUser", () => {
  it("returns AuthenticatedUser when session is valid", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "alice@nodwin.com",
          app_metadata: { role: "admin" },
          user_metadata: {},
        },
      },
      error: null,
    })

    const { requireUser } = await import("./auth")
    const result = await requireUser()

    expect(result).toEqual({
      id: "user-1",
      email: "alice@nodwin.com",
      role: "admin",
    })
  })

  it("falls back to user_metadata when app_metadata.role is absent", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-2",
          email: "bob@nodwin.com",
          app_metadata: {},
          user_metadata: { role: "sales_rep" },
        },
      },
      error: null,
    })

    const { requireUser } = await import("./auth")
    const result = await requireUser()

    expect(result.role).toBe("sales_rep")
  })

  it("sets role to undefined when no role metadata exists", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-3",
          email: "carol@nodwin.com",
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    })

    const { requireUser } = await import("./auth")
    const result = await requireUser()

    expect(result.role).toBeUndefined()
  })

  it("throws UnauthorisedError when no session exists", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing" },
    })

    const { requireUser } = await import("./auth")

    await expect(requireUser()).rejects.toThrow(UnauthorisedError)
  })

  it("throws UnauthorisedError when user is null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const { requireUser } = await import("./auth")

    await expect(requireUser()).rejects.toThrow(UnauthorisedError)
  })

  it("parses cookies from NextRequest when provided", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-4",
          email: "dave@nodwin.com",
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    })

    const mockRequest = {
      headers: {
        get: (key: string) => {
          if (key === "cookie") return "sb-access-token=abc; sb-refresh-token=def"
          return null
        },
      },
    }

    const { requireUser } = await import("./auth")
    const result = await requireUser(mockRequest as unknown as import("next/server").NextRequest)

    expect(result.id).toBe("user-4")
    expect(result.email).toBe("dave@nodwin.com")
  })

  it("returns local-preview admin when NEXT_PUBLIC_ENV is local-preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENV", "local-preview")

    const { requireUser } = await import("./auth")
    const result = await requireUser()

    expect(result).toEqual({
      id: "a0000000001-0001-0001-0001-000000000001",
      email: "alice.admin@nodwin-test.example",
      role: "admin",
    })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it("bypasses local-preview when NODE_ENV is not production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_ENV", "local-preview")

    const { requireUser } = await import("./auth")
    const result = await requireUser()

    expect(result).toEqual({
      id: "a0000000001-0001-0001-0001-000000000001",
      email: "alice.admin@nodwin-test.example",
      role: "admin",
    })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it("does not bypass in production even with local-preview env", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_ENV", "local-preview")

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "prod-user",
          email: "real@nodwin.com",
          app_metadata: { role: "admin" },
          user_metadata: {},
        },
      },
      error: null,
    })

    const { requireUser } = await import("./auth")
    const result = await requireUser()

    expect(result.id).toBe("prod-user")
    expect(result.email).toBe("real@nodwin.com")
    expect(mockGetUser).toHaveBeenCalled()
  })

  it("handles missing email gracefully", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-5",
          email: null,
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    })

    const { requireUser } = await import("./auth")
    const result = await requireUser()

    expect(result.email).toBeUndefined()
  })
})

describe("requireRole", () => {
  it("allows when user role matches required role", async () => {
    const { requireRole } = await import("./auth")
    const user = { id: "user-1", email: "admin@nodwin.com", role: "admin" }

    expect(() => requireRole(user, "admin")).not.toThrow()
  })

  it("throws ForbiddenError when user role does not match", async () => {
    const { requireRole } = await import("./auth")
    const user = { id: "user-2", email: "rep@nodwin.com", role: "sales_rep" }

    expect(() => requireRole(user, "admin")).toThrow(ForbiddenError)
  })

  it("throws ForbiddenError when user role is undefined", async () => {
    const { requireRole } = await import("./auth")
    const user = { id: "user-3", email: "none@nodwin.com", role: undefined }

    expect(() => requireRole(user, "admin")).toThrow(ForbiddenError)
  })
})
