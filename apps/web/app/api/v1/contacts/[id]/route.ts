import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getContactById } from "@/lib/data/contacts"

export const runtime = "nodejs"

export async function GET(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (ctx) => {
    const { id } = await route.params
    const record = await getContactById(ctx, id)
    if (!record) return Response.json({ error: "Contact not found" }, { status: 404 })
    return Response.json(record)
  })
}
