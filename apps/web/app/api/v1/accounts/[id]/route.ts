import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getAccountById, updateAccount, accountUpdateSchema } from "@/lib/data/accounts"

export const runtime = "nodejs"

export async function GET(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (ctx) => {
    const { id } = await route.params
    const record = await getAccountById(ctx, id)
    if (!record) return Response.json({ error: "Account not found" }, { status: 404 })
    return Response.json(record)
  })
}

// PATCH /api/v1/accounts/{id} — partial update (accountUpdateSchema).
export async function PATCH(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (ctx) => {
    const { id } = await route.params
    const body = await request.json().catch(() => ({}))
    const input = accountUpdateSchema.parse(body)
    const record = await updateAccount(ctx, id, input)
    return Response.json(record)
  })
}
