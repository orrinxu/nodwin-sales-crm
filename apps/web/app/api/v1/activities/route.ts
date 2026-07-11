import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { createActivity, activityCreateSchema } from "@/lib/data/activities"

export const runtime = "nodejs"

// POST /api/v1/activities — log a note / call / etc. against an opportunity,
// account, or contact (activityCreateSchema). The row is stamped with source:"mcp".
export async function POST(request: NextRequest) {
  return withApiUser(request, async (ctx) => {
    const body = await request.json().catch(() => ({}))
    const input = activityCreateSchema.parse(body)
    const record = await createActivity(ctx, input)
    return Response.json(record, { status: 201 })
  })
}
