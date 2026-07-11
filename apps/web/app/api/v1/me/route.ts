import "server-only"
import type { NextRequest } from "next/server"
import { withApiUser } from "@/lib/api/authenticate"

// Whoami — the fastest way for a rep to confirm their token works.
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return withApiUser(request, async (ctx) =>
    Response.json({ id: ctx.user.id, role: ctx.user.role ?? null, source: ctx.source }),
  )
}
