import { describe, it, expect, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import type { RouteLimitMap } from "./rate-limit"

function mapOf(entries: Record<string, { limit: number; windowMs: number }>): RouteLimitMap {
  return new Map(Object.entries(entries))
}

const TEST_LIMITS: RouteLimitMap = mapOf({
  "/api/ai": { limit: 30, windowMs: 60_000 },
  "/api/auth": { limit: 10, windowMs: 60_000 },
  "/api": { limit: 100, windowMs: 60_000 },
})

describe("InMemoryRateLimitStore", () => {
  beforeEach(async () => {
    const { setDefaultStore } = await import("./rate-limit")
    setDefaultStore(new (await import("./rate-limit")).InMemoryRateLimitStore())
  })

  it("increments count for a new key", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    const result = await store.increment("test:key", 60_000)
    expect(result.count).toBe(1)
    expect(result.ttl).toBeGreaterThan(0)
    expect(result.ttl).toBeLessThanOrEqual(60_000)
  })

  it("increments count for an existing key within the window", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    await store.increment("test:key", 60_000)
    const result = await store.increment("test:key", 60_000)
    expect(result.count).toBe(2)
  })

  it("resets a key", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    await store.increment("test:key", 60_000)
    await store.reset("test:key")
    const result = await store.increment("test:key", 60_000)
    expect(result.count).toBe(1)
  })

  it("resets after the window expires", async () => {
    const { InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    const shortWindow = 1
    await store.increment("test:key", shortWindow)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const result = await store.increment("test:key", shortWindow)
    expect(result.count).toBe(1)
  })
})

describe("findRouteConfig", () => {
  it("finds an exact match", async () => {
    const { findRouteConfig } = await import("./rate-limit")
    const config = findRouteConfig("/api/ai", TEST_LIMITS)
    expect(config).toEqual({ limit: 30, windowMs: 60_000 })
  })

  it("finds a prefix match", async () => {
    const { findRouteConfig } = await import("./rate-limit")
    const config = findRouteConfig("/api/ai/generate", TEST_LIMITS)
    expect(config).toEqual({ limit: 30, windowMs: 60_000 })
  })

  it("returns null for no match", async () => {
    const { findRouteConfig } = await import("./rate-limit")
    const config = findRouteConfig("/public/static", TEST_LIMITS)
    expect(config).toBeNull()
  })

  it("prefers the most specific prefix", async () => {
    const { findRouteConfig } = await import("./rate-limit")
    const config = findRouteConfig("/api/auth/login", TEST_LIMITS)
    expect(config).toEqual({ limit: 10, windowMs: 60_000 })
  })

  it("falls back to /api for an unknown /api path", async () => {
    const { findRouteConfig } = await import("./rate-limit")
    const config = findRouteConfig("/api/unknown/route", TEST_LIMITS)
    expect(config).toEqual({ limit: 100, windowMs: 60_000 })
  })
})

describe("buildRateLimitKey", () => {
  it("builds a namespaced key", async () => {
    const { buildRateLimitKey } = await import("./rate-limit")
    const key = buildRateLimitKey("user-1", "/api/ai")
    expect(key).toBe("ratelimit:user-1:/api/ai")
  })
})

describe("RateLimitError", () => {
  it("has the correct name and retryAfter", async () => {
    const { RateLimitError } = await import("./rate-limit")
    const err = new RateLimitError(30)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("RateLimitError")
    expect(err.retryAfter).toBe(30)
    expect(err.message).toContain("30")
  })
})

describe("checkRateLimit", () => {
  beforeEach(async () => {
    const { setDefaultStore, InMemoryRateLimitStore } = await import("./rate-limit")
    setDefaultStore(new InMemoryRateLimitStore())
  })

  it("allows requests within the limit", async () => {
    const { checkRateLimit } = await import("./rate-limit")
    const result = await checkRateLimit("user-1", "/api/ai", { limits: TEST_LIMITS })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(29)
    expect(result.limit).toBe(30)
    expect(result.retryAfter).toBeNull()
  })

  it("allows requests up to the limit", async () => {
    const { checkRateLimit } = await import("./rate-limit")
    for (let i = 0; i < 30; i++) {
      const result = await checkRateLimit("user-2", "/api/ai", { limits: TEST_LIMITS })
      if (i < 29) {
        expect(result.allowed).toBe(true)
      } else {
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(0)
      }
    }
  })

  it("blocks requests exceeding the limit", async () => {
    const { checkRateLimit } = await import("./rate-limit")
    const LIMIT = 10
    const limits = mapOf({ "/api/auth": { limit: LIMIT, windowMs: 60_000 } })

    for (let i = 0; i < LIMIT; i++) {
      await checkRateLimit("user-3", "/api/auth", { limits })
    }

    const result = await checkRateLimit("user-3", "/api/auth", { limits })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(result.retryAfter).toBeLessThanOrEqual(60)
  })

  it("tracks per-user independently", async () => {
    const { checkRateLimit } = await import("./rate-limit")
    const LIMIT = 5
    const limits = mapOf({ "/api/test": { limit: LIMIT, windowMs: 60_000 } })

    for (let i = 0; i < LIMIT; i++) {
      await checkRateLimit("user-a", "/api/test", { limits })
    }

    const userABlocked = await checkRateLimit("user-a", "/api/test", { limits })
    expect(userABlocked.allowed).toBe(false)

    const userBAllowed = await checkRateLimit("user-b", "/api/test", { limits })
    expect(userBAllowed.allowed).toBe(true)
    expect(userBAllowed.remaining).toBe(4)
  })

  it("tracks per-endpoint independently", async () => {
    const { checkRateLimit } = await import("./rate-limit")
    const limits = mapOf({
      "/api/endpoint-a": { limit: 2, windowMs: 60_000 },
      "/api/endpoint-b": { limit: 2, windowMs: 60_000 },
    })

    await checkRateLimit("user-x", "/api/endpoint-a", { limits })
    await checkRateLimit("user-x", "/api/endpoint-a", { limits })
    await checkRateLimit("user-x", "/api/endpoint-b", { limits })

    const endpointABlocked = await checkRateLimit("user-x", "/api/endpoint-a", { limits })
    expect(endpointABlocked.allowed).toBe(false)

    const endpointBAllowed = await checkRateLimit("user-x", "/api/endpoint-b", { limits })
    expect(endpointBAllowed.allowed).toBe(true)
    expect(endpointBAllowed.remaining).toBe(0)
  })

  it("allows unlimited requests for routes with no config", async () => {
    const { checkRateLimit } = await import("./rate-limit")
    for (let i = 0; i < 1000; i++) {
      const result = await checkRateLimit("user-y", "/unlimited", { limits: TEST_LIMITS })
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(Infinity)
    }
  })

  it("resets after the window expires", async () => {
    const { checkRateLimit, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    const limits = mapOf({ "/api/ephemeral": { limit: 2, windowMs: 1 } })

    await checkRateLimit("user-z", "/api/ephemeral", { store, limits })
    await checkRateLimit("user-z", "/api/ephemeral", { store, limits })

    const blocked = await checkRateLimit("user-z", "/api/ephemeral", { store, limits })
    expect(blocked.allowed).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 5))

    const allowed = await checkRateLimit("user-z", "/api/ephemeral", { store, limits })
    expect(allowed.allowed).toBe(true)
  })

  it("rapid-fire 100 requests confirms 429s after limit", async () => {
    const { checkRateLimit, InMemoryRateLimitStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    const LIMIT = 10
    const limits = mapOf({ "/api/rapid": { limit: LIMIT, windowMs: 60_000 } })

    const results: boolean[] = []
    for (let i = 0; i < 100; i++) {
      const result = await checkRateLimit("rapid-user", "/api/rapid", { store, limits })
      results.push(result.allowed)
    }

    const allowedCount = results.filter((r) => r === true).length
    const blockedCount = results.filter((r) => r === false).length

    expect(allowedCount).toBe(LIMIT)
    expect(blockedCount).toBe(90)
  })
})

function makeMockRequest(pathname: string, ip?: string): NextRequest {
  const headers = new Headers()
  if (ip) {
    headers.set("x-forwarded-for", ip)
  }
  return {
    nextUrl: { pathname } as URL,
    headers,
  } as NextRequest
}

describe("rateLimitRequest", () => {
  beforeEach(async () => {
    const { setDefaultStore, InMemoryRateLimitStore } = await import("./rate-limit")
    setDefaultStore(new InMemoryRateLimitStore())
  })

  it("returns rate limit headers for authenticated requests", async () => {
    const { rateLimitRequest } = await import("./rate-limit")
    const request = makeMockRequest("/api/ai/generate")

    const { result, headers } = await rateLimitRequest(request, "user-authed")
    expect(result.allowed).toBe(true)
    expect(headers["X-RateLimit-Limit"]).toBe("30")
    expect(headers["X-RateLimit-Remaining"]).toBe("29")
    expect(headers["Retry-After"]).toBeUndefined()
  })

  it("uses stricter limits for unauthenticated requests", async () => {
    const { rateLimitRequest } = await import("./rate-limit")
    const request = makeMockRequest("/api/ai/generate")

    const { result } = await rateLimitRequest(request)
    expect(result.limit).toBe(5)
  })

  it("sets Retry-After when rate limited", async () => {
    const { rateLimitRequest, InMemoryRateLimitStore, setDefaultStore } = await import("./rate-limit")
    const store = new InMemoryRateLimitStore()
    setDefaultStore(store)
    const request = makeMockRequest("/api/auth")

    for (let i = 0; i < 10; i++) {
      await rateLimitRequest(request, "user-limited")
    }

    const { result, headers } = await rateLimitRequest(request, "user-limited")
    expect(result.allowed).toBe(false)
    expect(headers["Retry-After"]).toBeDefined()
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0)
    expect(headers["X-RateLimit-Remaining"]).toBe("0")
  })

  it("uses client IP when no user identifier is provided", async () => {
    const { rateLimitRequest } = await import("./rate-limit")
    const request = makeMockRequest("/api/auth", "203.0.113.42")

    const { result } = await rateLimitRequest(request)
    expect(result.allowed).toBe(true)
  })
})
