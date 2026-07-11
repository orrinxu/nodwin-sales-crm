import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getOpportunities, createOpportunity, opportunityCreateSchema } from "@/lib/data/opportunities"

export const runtime = "nodejs"

// GET /api/v1/opportunities?scope=all|mine — RLS-scoped to the token's owner.
// (Text search over opportunities is a fast-follow; the data layer lists only.)
export async function GET(request: NextRequest) {
  return withApiUser(request, async (ctx) => {
    const scope = new URL(request.url).searchParams.get("scope") === "mine" ? "mine" : "all"
    const result = await getOpportunities(ctx, { scope })
    return Response.json(result)
  })
}

// POST /api/v1/opportunities — create a deal. Body matches opportunityCreateSchema
// (resolve accountId/ownerId etc. via the search endpoints first). 400 on bad input.
export async function POST(request: NextRequest) {
  return withApiUser(request, async (ctx) => {
    const body = await request.json().catch(() => ({}))
    const input = opportunityCreateSchema.parse(body)
    const record = await createOpportunity(ctx, input)
    return Response.json(record, { status: 201 })
  })
}
