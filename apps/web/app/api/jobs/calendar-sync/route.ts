import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { env } from "@/lib/security/env"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { runCalendarSyncForUser } from "@/lib/integrations/calendar/sync"
import { CALENDAR_SCOPE } from "@/lib/integrations/google/calendar-client"

// ORR-826 Google Calendar pull-sync drain. Invoked by a scheduler (cron → this
// route), because the work makes outbound Google Calendar calls that pg_cron
// cannot. Protected by a shared secret (CALENDAR_SYNC_CRON_SECRET) — until it is
// set the route reports "not configured" and does nothing. Runs under the
// service role (no user session): it iterates every sync-enabled user with a
// connected Google grant that includes the calendar.events scope.

export const runtime = "nodejs"

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

function secretOk(provided: string | null): boolean {
  const expected = env.CALENDAR_SYNC_CRON_SECRET
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

interface UserSyncOutcome {
  userId: string
  upserted: number
  removed: number
  skipped?: boolean
  error?: string
}

/**
 * Resolve which users to sync. `userId` targets one user; otherwise iterate
 * users whose `google_calendar_sync_state.sync_enabled` is true AND who hold a
 * connected Google grant that includes the calendar.events scope.
 *
 * `sync_state` and `google_oauth_connections` share no direct FK (both only
 * reference `users`), so PostgREST cannot embed one in the other — we run two
 * filtered queries and intersect. `contains` keeps the scope filter server-side.
 */
async function resolveTargetUserIds(
  db: ReturnType<typeof createServiceRoleClient>,
  explicitUserId: string | null,
  limit: number,
): Promise<string[]> {
  if (explicitUserId) return [explicitUserId]

  const { data: enabled, error: enabledError } = await db
    .from("google_calendar_sync_state")
    .select("user_id")
    .eq("sync_enabled", true)
    .limit(1000)

  if (enabledError) {
    throw new Error(`Failed to list sync-enabled users: ${enabledError.message}`)
  }
  const enabledIds = (enabled ?? []).map((r) => r.user_id as string)
  if (enabledIds.length === 0) return []

  const { data: connected, error: connectedError } = await db
    .from("google_oauth_connections")
    .select("user_id")
    .eq("status", "connected")
    .contains("granted_scopes", [CALENDAR_SCOPE])
    .in("user_id", enabledIds)

  if (connectedError) {
    throw new Error(`Failed to list connected users: ${connectedError.message}`)
  }

  return (connected ?? []).map((r) => r.user_id as string).slice(0, limit)
}

export async function POST(request: NextRequest) {
  if (!env.CALENDAR_SYNC_CRON_SECRET) {
    return NextResponse.json(
      { error: "Calendar sync is not configured (CALENDAR_SYNC_CRON_SECRET unset)." },
      { status: 503 },
    )
  }

  const header = request.headers.get("authorization")
  const provided = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : request.headers.get("x-cron-secret")

  if (!secretOk(provided)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const explicitUserId = searchParams.get("userId")
  const limit = Math.min(Number(searchParams.get("limit")) || DEFAULT_LIMIT, MAX_LIMIT)

  const db = createServiceRoleClient()

  try {
    const userIds = await resolveTargetUserIds(db, explicitUserId, limit)

    const outcomes: UserSyncOutcome[] = []
    for (const userId of userIds) {
      try {
        const res = await runCalendarSyncForUser(userId)
        outcomes.push({ userId, ...res })
      } catch (err) {
        // A single user's failure (already dead-lettered by the sync engine)
        // must not abort the batch.
        outcomes.push({
          userId,
          upserted: 0,
          removed: 0,
          error: err instanceof Error ? err.message : "sync failed",
        })
      }
    }

    const upserted = outcomes.reduce((n, o) => n + o.upserted, 0)
    const removed = outcomes.reduce((n, o) => n + o.removed, 0)
    const failed = outcomes.filter((o) => o.error).length
    const skipped = outcomes.filter((o) => o.skipped).length

    // Audit the run alongside pg_cron jobs (cron_job_runs — pg_cron scaffold).
    await db.from("cron_job_runs").insert({
      job_name: "calendar_sync_drain",
      status: failed > 0 ? "error" : "ok",
      detail: {
        processed: outcomes.length,
        upserted,
        removed,
        failed,
        skipped,
      },
    })

    return NextResponse.json({
      processed: outcomes.length,
      upserted,
      removed,
      failed,
      skipped,
      results: outcomes,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
