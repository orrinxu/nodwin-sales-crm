import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getOpportunityById } from "@/lib/data/opportunities"

export const runtime = "nodejs"

export async function GET(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (ctx) => {
    const { id } = await route.params
    const record = await getOpportunityById(ctx, id)
    if (!record) return Response.json({ error: "Opportunity not found" }, { status: 404 })
    return Response.json(record)
  })
}
