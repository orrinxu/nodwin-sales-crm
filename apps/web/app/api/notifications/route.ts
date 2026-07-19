import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/security/auth"
import { UnauthorisedError, ForbiddenError } from "@/lib/security/errors"
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationCallContext,
} from "@/lib/data/notifications"

// ORR-798: the per-user in-app feed (user_notifications, written by
// lib/notifications/delivery.ts) had no read surface — the header bell fetched
// the admin-only /api/admin/alerts, so every non-admin saw a permanent "No
// notifications". This route exposes the user's own feed. The data layer runs
// under the request's Supabase client, so RLS scopes every read/write to
// auth.uid() (user_notifications_select_own_or_admin); we still pass user.id.

export const runtime = "nodejs"

function ctxFor(user: {
  id: string
  email?: string
  role?: string
}): NotificationCallContext {
  return {
    user: { id: user.id, email: user.email ?? "", role: user.role ?? "" },
    source: "web",
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const ctx = ctxFor(user)

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get("unread") === "true"
    const page = Number(searchParams.get("page")) || undefined
    const pageSize = Number(searchParams.get("pageSize")) || undefined

    const [feed, unreadCount] = await Promise.all([
      getUserNotifications(ctx, user.id, unreadOnly, page, pageSize),
      getUnreadNotificationCount(ctx, user.id),
    ])

    return NextResponse.json({
      notifications: feed.notifications,
      total: feed.total,
      page: feed.page,
      pageSize: feed.pageSize,
      unreadCount,
    })
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
    const ctx = ctxFor(user)

    const body = await request.json().catch(() => ({}))

    if (body?.all === true) {
      await markAllNotificationsRead(ctx, user.id)
      return NextResponse.json({ success: true })
    }

    const id = typeof body?.id === "string" ? body.id : null
    if (!id) {
      return NextResponse.json(
        { error: "Missing notification id (or 'all: true')" },
        { status: 400 },
      )
    }

    // RLS (user_notifications_update_own_or_admin) guarantees a user can only
    // mark their own notifications read — a foreign id updates zero rows.
    await markNotificationRead(ctx, id)
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
