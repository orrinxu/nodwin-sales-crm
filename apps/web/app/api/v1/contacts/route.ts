import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getContacts } from "@/lib/data/contacts"

export const runtime = "nodejs"

// GET /api/v1/contacts?query=&accountId=&ownerId= — RLS-scoped search.
export async function GET(request: NextRequest) {
  return withApiUser(request, async (ctx) => {
    const p = new URL(request.url).searchParams
    const result = await getContacts(ctx, {
      query: p.get("query") ?? undefined,
      accountId: p.get("accountId") ?? undefined,
      ownerId: p.get("ownerId") ?? undefined,
    })
    return Response.json(result)
  })
}
