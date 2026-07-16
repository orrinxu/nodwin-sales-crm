import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { env } from "@/lib/security/env"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { createDriveAdminClient } from "@/lib/integrations/drive"
import { syncPendingOpportunityFolders } from "@/lib/integrations/drive/sync"

// ORR-698 Drive folder + permission sync drain. Invoked by a scheduler (cron →
// this route), because the work makes outbound Google Drive calls. Protected by a
// shared secret (DRIVE_SYNC_CRON_SECRET) and gated on the service-account key —
// until both are set the route reports "not configured" and does nothing. Runs
// under the service role because it must read every opportunity's visibility set.

export const runtime = "nodejs"

function secretOk(provided: string | null): boolean {
  const expected = env.DRIVE_SYNC_CRON_SECRET
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!env.DRIVE_SYNC_CRON_SECRET) {
    return NextResponse.json(
      { error: "Drive sync is not configured (DRIVE_SYNC_CRON_SECRET unset)." },
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

  const client = createDriveAdminClient()
  if (!client) {
    return NextResponse.json(
      { error: "Drive sync is not configured (GOOGLE_SERVICE_ACCOUNT_KEY unset)." },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 25, 100)

  try {
    const db = createServiceRoleClient()
    const results = await syncPendingOpportunityFolders(db, client, limit)
    const synced = results.filter((r) => r.status === "synced").length
    const skipped = results.filter((r) => r.status === "skipped").length
    const failed = results.filter((r) => r.status === "failed").length
    return NextResponse.json({ processed: results.length, synced, skipped, failed, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
