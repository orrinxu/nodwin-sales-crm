import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getAccountById } from "@/lib/data/accounts"

export const runtime = "nodejs"

export async function GET(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (ctx) => {
    const { id } = await route.params
    const record = await getAccountById(ctx, id)
    if (!record) return Response.json({ error: "Account not found" }, { status: 404 })
    return Response.json(record)
  })
}
