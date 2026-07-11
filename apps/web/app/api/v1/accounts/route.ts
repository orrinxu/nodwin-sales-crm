import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getAccounts, createAccount, accountCreateSchema } from "@/lib/data/accounts"

export const runtime = "nodejs"

// GET /api/v1/accounts?query=&industry=&ownerId= — RLS-scoped search.
export async function GET(request: NextRequest) {
  return withApiUser(request, async (ctx) => {
    const p = new URL(request.url).searchParams
    const result = await getAccounts(ctx, {
      query: p.get("query") ?? undefined,
      industry: p.get("industry") ?? undefined,
      ownerId: p.get("ownerId") ?? undefined,
    })
    return Response.json(result)
  })
}

// POST /api/v1/accounts — create an account (accountCreateSchema).
export async function POST(request: NextRequest) {
  return withApiUser(request, async (ctx) => {
    const body = await request.json().catch(() => ({}))
    const input = accountCreateSchema.parse(body)
    const record = await createAccount(ctx, input)
    return Response.json(record, { status: 201 })
  })
}
