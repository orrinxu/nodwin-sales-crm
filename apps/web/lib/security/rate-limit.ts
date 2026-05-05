import "server-only"
import { createServerClient } from "@supabase/ssr"
import { env } from "./env"

export class TooManyRequestsError extends Error {
  public retryAfter: number

  constructor(retryAfter: number) {
    super("Too many requests")
    this.name = "TooManyRequestsError"
    this.retryAfter = retryAfter
  }
}

export interface RateLimitConfig {
  windowMs: number
  max: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter: number
}

export interface RateLimitStore {
  increment(key: string, windowMs: number, max: number): Promise<RateLimitResult>
}

// ── In-memory store (dev / testing) ───────────────────────────────────

export class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; windowStart: number }>()

  async increment(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
    const now = Date.now()
    const entry = this.store.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
      this.store.set(key, { count: 1, windowStart: now })
      return { allowed: true, remaining: max - 1, retryAfter: Math.ceil(windowMs / 1000) }
    }

    entry.count += 1
    const elapsed = now - entry.windowStart
    const retryAfter = Math.ceil((windowMs - elapsed) / 1000)

    return {
      allowed: entry.count <= max,
      remaining: Math.max(0, max - entry.count),
      retryAfter,
    }
  }

  reset(): void {
    this.store.clear()
  }
}

// ── Supabase store (production) ───────────────────────────────────────

export class SupabaseRateLimitStore implements RateLimitStore {
  async increment(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
    const client = createServerClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { cookies: { getAll: () => [], setAll: () => {} } },
    )

    const now = new Date()
    const windowStart = new Date(now.getTime() - (now.getTime() % windowMs))

    const { data, error } = await client.rpc("rate_limit_increment", {
      p_key: key,
      p_window_start: windowStart.toISOString(),
      p_window_ms: windowMs,
      p_max: max,
    })

    if (error) {
      throw new Error(`rate_limit: ${error.message}`)
    }

    const result = data as unknown as RateLimitResult
    return result
  }
}

// ── Route matching & config resolution ────────────────────────────────

export const defaultRateLimits: Record<string, RateLimitConfig> = {
  "default:unauthenticated": { windowMs: 60_000, max: 60 },
  "default:authenticated": { windowMs: 60_000, max: 120 },
  "/api/ai/*:unauthenticated": { windowMs: 60_000, max: 5 },
  "/api/ai/*:authenticated": { windowMs: 60_000, max: 30 },
}

function matchRoute(path: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    return path.startsWith(pattern.slice(0, -2))
  }
  return path === pattern
}

export function getRateLimitConfig(
  path: string,
  isAuthenticated: boolean,
  customLimits?: Record<string, RateLimitConfig>,
): RateLimitConfig {
  const limits = { ...defaultRateLimits, ...customLimits }
  const authSuffix = isAuthenticated ? "authenticated" : "unauthenticated"

  for (const [pattern, config] of Object.entries(limits)) {
    const colonIdx = pattern.lastIndexOf(":")
    if (colonIdx === -1) continue
    const routePattern = pattern.slice(0, colonIdx)
    const authPart = pattern.slice(colonIdx + 1)
    if (authPart === authSuffix && matchRoute(path, routePattern)) {
      return config
    }
  }

  const defaultEntry = Object.entries(limits).find(
    ([key]) => key === `default:${authSuffix}`,
  )
  if (defaultEntry) {
    return defaultEntry[1]
  }

  return { windowMs: 60_000, max: 60 }
}

// ── Global store registry ────────────────────────────────────────────

let defaultStore: RateLimitStore | undefined

export function setRateLimitStore(store: RateLimitStore): void {
  defaultStore = store
}

export function getRateLimitStore(): RateLimitStore {
  if (!defaultStore) {
    defaultStore = new InMemoryRateLimitStore()
  }
  return defaultStore
}

// ── Main entry point ──────────────────────────────────────────────────

export async function rateLimit(
  params: {
    path: string
    userId?: string
    ip?: string
    isAuthenticated: boolean
    customLimits?: Record<string, RateLimitConfig>
    store?: RateLimitStore
  },
): Promise<RateLimitResult> {
  const store = params.store ?? getRateLimitStore()
  const config = getRateLimitConfig(params.path, params.isAuthenticated, params.customLimits)

  const identifier = params.userId ?? params.ip ?? "anonymous"
  const key = `${params.path}:${identifier}`

  const result = await store.increment(key, config.windowMs, config.max)

  if (!result.allowed) {
    throw new TooManyRequestsError(result.retryAfter)
  }

  return result
}
