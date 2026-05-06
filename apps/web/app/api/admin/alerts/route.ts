import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { env } from "@/lib/security/env"
import { requireUser, requireRole } from "@/lib/security/auth"
import { ForbiddenError, UnauthorisedError } from "@/lib/security/errors"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    requireRole(user, "admin")

    const supabase = createServerClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      },
    )

    const { searchParams } = new URL(request.url)
    const includeAcknowledged = searchParams.get("acknowledged") === "true"
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200)
    const offset = Number(searchParams.get("offset")) || 0

    let query = supabase
      .from("admin_alerts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (!includeAcknowledged) {
      query = query.is("acknowledged_at", null)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count })
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

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request)
    requireRole(user, "admin")

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "Missing alert id" }, { status: 400 })
    }

    const supabase = createServerClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      },
    )

    const { error } = await supabase
      .from("admin_alerts")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
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
