import "server-only"
import type { NextRequest } from "next/server"

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }>
  reset(key: string): Promise<void>
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; expiresAt: number }>()

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key)
      }
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    this.cleanup()
    const now = Date.now()
    const entry = this.store.get(key)

    if (!entry || entry.expiresAt <= now) {
      this.store.set(key, { count: 1, expiresAt: now + windowMs })
      return { count: 1, ttl: windowMs }
    }

    entry.count++
    return { count: entry.count, ttl: entry.expiresAt - now }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  snapshot(): Map<string, { count: number; expiresAt: number }> {
    return new Map(this.store)
  }
}

export interface RateLimitConfig {
  limit: number
  windowMs: number
}

export type RouteLimitMap = ReadonlyMap<string, RateLimitConfig>

function buildLimitMap(entries: [string, RateLimitConfig][]): RouteLimitMap {
  return new Map(entries)
}

export const DEFAULT_RATE_LIMITS: RouteLimitMap = buildLimitMap([
  ["/api/ai", { limit: 30, windowMs: 60_000 }],
  ["/api/auth", { limit: 10, windowMs: 60_000 }],
  ["/api/webhooks", { limit: 60, windowMs: 60_000 }],
  ["/api", { limit: 100, windowMs: 60_000 }],
])

export const UNAUTHENTICATED_RATE_LIMITS: RouteLimitMap = buildLimitMap([
  ["/api/ai", { limit: 5, windowMs: 60_000 }],
  ["/api/auth", { limit: 10, windowMs: 60_000 }],
  ["/api/webhooks", { limit: 60, windowMs: 60_000 }],
  ["/api", { limit: 20, windowMs: 60_000 }],
])

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter: number | null
  limit: number
}

export class RateLimitError extends Error {
  public retryAfter: number

  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s.`)
    this.name = "RateLimitError"
    this.retryAfter = retryAfter
  }
}

function getLimitConfig(
  path: string,
  limits: RouteLimitMap,
): RateLimitConfig | null {
  const exact = limits.get(path)
  if (exact) return exact

  const prefixes: string[] = []
  for (const prefix of limits.keys()) {
    if (path.startsWith(prefix)) {
      prefixes.push(prefix)
    }
  }

  if (prefixes.length === 0) return null

  prefixes.sort((a, b) => b.length - a.length)
  return limits.get(prefixes[0]) ?? null
}

export function findRouteConfig(
  path: string,
  limits: RouteLimitMap = DEFAULT_RATE_LIMITS,
): RateLimitConfig | null {
  return getLimitConfig(path, limits)
}

export function buildRateLimitKey(identifier: string, path: string): string {
  return `ratelimit:${identifier}:${path}`
}

let defaultStore: RateLimitStore | null = null

export function setDefaultStore(store: RateLimitStore): void {
  defaultStore = store
}

export function getDefaultStore(): RateLimitStore {
  if (!defaultStore) {
    defaultStore = new InMemoryRateLimitStore()
  }
  return defaultStore
}

export async function checkRateLimit(
  identifier: string,
  path: string,
  options?: {
    store?: RateLimitStore
    limits?: RouteLimitMap
  },
): Promise<RateLimitResult> {
  const store = options?.store ?? getDefaultStore()
  const config = findRouteConfig(path, options?.limits)

  if (!config) {
    return { allowed: true, remaining: Infinity, retryAfter: null, limit: Infinity }
  }

  const key = buildRateLimitKey(identifier, path)
  const { count, ttl } = await store.increment(key, config.windowMs)

  const remaining = Math.max(0, config.limit - count)
  const retryAfter = count > config.limit ? Math.ceil(ttl / 1000) : null

  return {
    allowed: count <= config.limit,
    remaining,
    retryAfter,
    limit: config.limit,
  }
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  return "127.0.0.1"
}

export async function rateLimitRequest(
  request: NextRequest,
  userIdentifier?: string,
  path?: string,
): Promise<{
  result: RateLimitResult
  headers: Record<string, string>
}> {
  const routePath = path ?? request.nextUrl.pathname
  const identifier = userIdentifier ?? getClientIp(request)
  const limits = userIdentifier ? DEFAULT_RATE_LIMITS : UNAUTHENTICATED_RATE_LIMITS

  const result = await checkRateLimit(identifier, routePath, { limits })

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  }

  if (result.retryAfter !== null) {
    headers["Retry-After"] = String(result.retryAfter)
  }

  return { result, headers }
}
