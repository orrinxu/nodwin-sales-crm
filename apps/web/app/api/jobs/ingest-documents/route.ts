import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { env } from "@/lib/security/env"
import { createDriveClient } from "@/lib/integrations/drive"
import { createEmbedder } from "@/lib/ai/embeddings"
import { runIngestionBatch } from "@/lib/ingestion/worker"

// ORR-620 ingestion worker drain. Intended to be invoked by a scheduler
// (Vercel Cron → this route) rather than pg_cron, because the worker makes
// outbound calls (Drive fetch + embeddings) that pg_cron cannot. Protected by a
// shared secret (INGESTION_CRON_SECRET). Until the Drive + embeddings seams are
// wired, documents drain to 'failed' with a "not configured" message — the
// framework runs; the external calls no-op.

export const runtime = "nodejs"

function secretOk(provided: string | null): boolean {
  const expected = env.INGESTION_CRON_SECRET
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!env.INGESTION_CRON_SECRET) {
    return NextResponse.json(
      { error: "Ingestion worker is not configured (INGESTION_CRON_SECRET unset)." },
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
  const limit = Math.min(Number(searchParams.get("limit")) || 10, 50)

  try {
    const summary = await runIngestionBatch(
      { drive: createDriveClient(), embedder: createEmbedder() },
      limit,
    )
    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
