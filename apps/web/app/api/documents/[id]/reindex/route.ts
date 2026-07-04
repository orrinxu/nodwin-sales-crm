import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/security/auth"
import { UnauthorisedError, ForbiddenError } from "@/lib/security/errors"
import { requestReindex } from "@/lib/data/documents"

// ORR-620 manual re-index trigger. A user (uploader or admin, enforced by the
// documents UPDATE RLS policy) flips a document back to 'pending' so the worker
// re-ingests it. This is the invokable entry point for the index-status
// indicator's "re-index" action once a documents UI exists to host it.

export const runtime = "nodejs"

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request)
    const { id } = await ctx.params

    await requestReindex(
      { user: { id: user.id, email: user.email ?? "", role: user.role ?? "" }, source: "web" },
      id,
    )
    return NextResponse.json({ success: true, status: "pending" })
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
