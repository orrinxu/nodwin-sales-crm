import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRpc = vi.fn()
const mockFrom = vi.fn()

const mockSupabaseClient = {
  from: mockFrom,
  rpc: mockRpc,
}

vi.mock("server-only", () => ({}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => mockSupabaseClient),
}))
vi.mock("./env", () => ({
  env: {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "eyjanon.abcdef123",
    SUPABASE_SERVICE_ROLE_KEY: "eyjrole.abcdef456",
    GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
    APP_URL: "https://app.example.com",
    NEXT_PUBLIC_APP_NAME: "Nodwin CRM",
    NEXT_PUBLIC_API_URL: "https://api.example.com",
    NEXT_PUBLIC_DEBUG: "false" as const,
    NEXT_PUBLIC_LOG_LEVEL: "info" as const,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// ── InMemoryRateLimitStore ─────────────────────────────────────────────

describe("InMemoryRateLimitStore", () => {
  it("allows the first request within the limit", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    const result = await store.increment("test-key", 60_000, 5)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it("tracks remaining count across multiple requests", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    await store.increment("test-key", 60_000, 3)
    await store.increment("test-key", 60_000, 3)
    const result = await store.increment("test-key", 60_000, 3)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)

    const exceeded = await store.increment("test-key", 60_000, 3)
    expect(exceeded.allowed).toBe(false)
    expect(exceeded.remaining).toBe(0)
  })

  it("resets after the window expires", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    vi.useFakeTimers()

    await store.increment("reset-key", 60_000, 1)
    const blocked = await store.increment("reset-key", 60_000, 1)
    expect(blocked.allowed).toBe(false)

    vi.advanceTimersByTime(60_001)
    const allowed = await store.increment("reset-key", 60_000, 1)
    expect(allowed.allowed).toBe(true)

    vi.useRealTimers()
  })

  it("tracks different keys independently", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    await store.increment("user-a", 60_000, 1)
    const userA = await store.increment("user-a", 60_000, 1)
    expect(userA.allowed).toBe(false)

    const userB = await store.increment("user-b", 60_000, 1)
    expect(userB.allowed).toBe(true)
  })

  it("reset() clears all state", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    await store.increment("key-1", 60_000, 1)
    expect((await store.increment("key-1", 60_000, 1)).allowed).toBe(false)

    store.reset()
    expect((await store.increment("key-1", 60_000, 1)).allowed).toBe(true)
  })
})

// ── SupabaseRateLimitStore ─────────────────────────────────────────────

describe("SupabaseRateLimitStore", () => {
  it("calls rate_limit_increment RPC and returns result", async () => {
    const { SupabaseRateLimitStore } = await import("./rate-limit")
    const store = new SupabaseRateLimitStore()

    mockRpc.mockResolvedValue({
      data: { allowed: true, remaining: 4, retryAfter: 57 },
      error: null,
    })

    const result = await store.increment("route:user-1", 60_000, 5)

    expect(mockRpc).toHaveBeenCalledWith("rate_limit_increment", {
      p_key: "route:user-1",
      p_window_start: expect.any(String),
      p_window_ms: 60_000,
      p_max: 5,
    })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it("throws on RPC error", async () => {
    const { SupabaseRateLimitStore } = await import("./rate-limit")
    const store = new SupabaseRateLimitStore()

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    })

    await expect(store.increment("k", 60_000, 5)).rejects.toThrow("rate_limit: connection refused")
  })
})

// ── getRateLimitConfig ─────────────────────────────────────────────────

describe("getRateLimitConfig", () => {
  it("returns unauthenticated limit for unknown route", async () => {
    const { getRateLimitConfig } = await import("./rate-limit")
    const config = getRateLimitConfig("/api/health", false)
    expect(config.max).toBe(60)
  })

  it("returns authenticated limit for unknown route", async () => {
    const { getRateLimitConfig } = await import("./rate-limit")
    const config = getRateLimitConfig("/api/health", true)
    expect(config.max).toBe(120)
  })

  it("returns strict limit for /api/ai/* unauthenticated", async () => {
    const { getRateLimitConfig } = await import("./rate-limit")
    const config = getRateLimitConfig("/api/ai/chat", false)
    expect(config.max).toBe(5)
  })

  it("returns moderate limit for /api/ai/* authenticated", async () => {
    const { getRateLimitConfig } = await import("./rate-limit")
    const config = getRateLimitConfig("/api/ai/chat", true)
    expect(config.max).toBe(30)
  })

  it("matches nested paths under /api/ai/*", async () => {
    const { getRateLimitConfig } = await import("./rate-limit")
    expect(getRateLimitConfig("/api/ai/summarise/123", true).max).toBe(30)
    expect(getRateLimitConfig("/api/ai/draft-email", false).max).toBe(5)
  })

  it("allows custom limits to override defaults", async () => {
    const { getRateLimitConfig } = await import("./rate-limit")
    const custom = { "/api/webhooks/*:unauthenticated": { windowMs: 60_000, max: 10 } }
    const config = getRateLimitConfig("/api/webhooks/stripe", false, custom)
    expect(config.max).toBe(10)
  })
})

// ── rateLimit integration (with InMemory store) ────────────────────────

describe("rateLimit", () => {
  it("allows requests within limit", async () => {
    const { rateLimit, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    const result = await rateLimit({
      path: "/api/test",
      userId: "user-1",
      isAuthenticated: true,
      store,
    })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBeGreaterThanOrEqual(0)
  })

  it("throws TooManyRequestsError when limit exceeded", async () => {
    const { rateLimit, InMemoryRateLimitStore, TooManyRequestsError } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    // Use a very low limit
    await rateLimit({
      path: "/api/test",
      userId: "user-1",
      isAuthenticated: true,
      customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
      store,
    })

    await expect(
      rateLimit({
        path: "/api/test",
        userId: "user-1",
        isAuthenticated: true,
        customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
        store,
      }),
    ).rejects.toThrow(TooManyRequestsError)
  })

  it("throws with retryAfter in error", async () => {
    const { rateLimit, InMemoryRateLimitStore, TooManyRequestsError } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    await rateLimit({
      path: "/api/test",
      userId: "user-1",
      isAuthenticated: true,
      customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
      store,
    })

    try {
      await rateLimit({
        path: "/api/test",
        userId: "user-1",
        isAuthenticated: true,
        customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
        store,
      })
      expect.fail("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(TooManyRequestsError)
      expect((e as { retryAfter: number }).retryAfter).toBeGreaterThan(0)
    }
  })

  it("treats different users independently", async () => {
    const { rateLimit, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    await rateLimit({
      path: "/api/test",
      userId: "user-a",
      isAuthenticated: true,
      customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
      store,
    })

    // User B should still be allowed
    await expect(
      rateLimit({
        path: "/api/test",
        userId: "user-b",
        isAuthenticated: true,
        customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
        store,
      }),
    ).resolves.toBeDefined()
  })

  it("treats different routes independently", async () => {
    const { rateLimit, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    await rateLimit({
      path: "/api/route-a",
      userId: "user-1",
      isAuthenticated: true,
      customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
      store,
    })

    // Different route should still be allowed
    await expect(
      rateLimit({
        path: "/api/route-b",
        userId: "user-1",
        isAuthenticated: true,
        customLimits: { "default:authenticated": { windowMs: 60_000, max: 1 } },
        store,
      }),
    ).resolves.toBeDefined()
  })

  it("uses IP as fallback identifier when no userId", async () => {
    const { rateLimit, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    const result = await rateLimit({
      path: "/api/test",
      ip: "203.0.113.42",
      isAuthenticated: false,
      store,
    })

    expect(result.allowed).toBe(true)
  })

  it("uses 'anonymous' when neither userId nor IP provided", async () => {
    const { rateLimit, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    const result = await rateLimit({
      path: "/api/test",
      isAuthenticated: false,
      store,
    })

    expect(result.allowed).toBe(true)
  })

  // ── Rapid-fire: 100 requests, confirm 429s after limit ──────────────

  it("rapid-fire: blocks requests after the limit with Retry-After", async () => {
    const { rateLimit, InMemoryRateLimitStore, TooManyRequestsError } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()

    const LIMIT = 10
    const TOTAL = 100

    let allowed = 0
    let blocked = 0
    let lastRetryAfter = 0

    for (let i = 0; i < TOTAL; i++) {
      try {
        await rateLimit({
          path: "/api/test",
          userId: "rapid-fire-user",
          isAuthenticated: true,
          customLimits: { "default:authenticated": { windowMs: 60_000, max: LIMIT } },
          store,
        })
        allowed++
      } catch (e) {
        expect(e).toBeInstanceOf(TooManyRequestsError)
        blocked++
        lastRetryAfter = (e as { retryAfter: number }).retryAfter
      }
    }

    expect(allowed).toBe(LIMIT)
    expect(blocked).toBe(TOTAL - LIMIT)
    expect(lastRetryAfter).toBeGreaterThan(0)
  })
})

// ── TooManyRequestsError ───────────────────────────────────────────────

describe("TooManyRequestsError", () => {
  it("sets retryAfter from constructor", async () => {
    const { TooManyRequestsError } = await import("./rate-limit")
    const err = new TooManyRequestsError(42)
    expect(err.message).toBe("Too many requests")
    expect(err.name).toBe("TooManyRequestsError")
    expect(err.retryAfter).toBe(42)
  })
})

// ── setRateLimitStore / getRateLimitStore ──────────────────────────────

describe("global store registry", () => {
  it("returns InMemoryRateLimitStore by default", async () => {
    const { getRateLimitStore, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = getRateLimitStore()
    expect(store).toBeInstanceOf(InMemoryRateLimitStore)
  })

  it("setRateLimitStore overrides the global store", async () => {
    const { setRateLimitStore, getRateLimitStore, InMemoryRateLimitStore } = await import("./rate-limit")
    const customStore = new InMemoryRateLimitStore()
    setRateLimitStore(customStore)
    expect(getRateLimitStore()).toBe(customStore)
  })
})
