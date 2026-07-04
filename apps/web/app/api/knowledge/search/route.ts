import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/security/auth"
import { UnauthorisedError, ForbiddenError } from "@/lib/security/errors"
import { answer, KNOWLEDGE_MAX_MATCH_COUNT } from "@/lib/data/knowledge"

// ORR-621 cross-deal knowledge search. Single-shot Q&A: question in → grounded,
// cited answer out. Runs as source: 'web' (user query path — never 'system').
// The tier filter + entitlement live in the DB (search_document_chunks);
// generation is self-hosted and refuses to answer with no sources.

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const body = await request.json().catch(() => ({}))
    const query = typeof body?.query === "string" ? body.query : ""

    if (query.trim().length === 0) {
      return NextResponse.json({ error: "Missing 'query'." }, { status: 400 })
    }

    const rawMatchCount = typeof body?.matchCount === "number" ? body.matchCount : undefined
    const matchCount = rawMatchCount !== undefined ? Math.min(Math.max(0, rawMatchCount), KNOWLEDGE_MAX_MATCH_COUNT) : undefined

    const result = await answer(
      { user: { id: user.id, email: user.email ?? "", role: user.role ?? "" }, source: "web" },
      {
        query,
        matchCount,
        minSimilarity: typeof body?.minSimilarity === "number" ? body.minSimilarity : undefined,
      },
    )

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
