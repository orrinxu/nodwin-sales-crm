import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"
import { getContactById, updateContact, contactUpdateSchema } from "@/lib/data/contacts"

export const runtime = "nodejs"

export async function GET(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (ctx) => {
    const { id } = await route.params
    const record = await getContactById(ctx, id)
    if (!record) return Response.json({ error: "Contact not found" }, { status: 404 })
    return Response.json(record)
  })
}

// PATCH /api/v1/contacts/{id} — partial update (contactUpdateSchema).
export async function PATCH(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  return withApiUser(request, async (ctx) => {
    const { id } = await route.params
    const body = await request.json().catch(() => ({}))
    const input = contactUpdateSchema.parse(body)
    const record = await updateContact(ctx, id, input)
    return Response.json(record)
  })
}
