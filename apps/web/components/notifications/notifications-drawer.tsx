"use client"

import { useState, useCallback } from "react"
import { Bell, CheckCheck, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/components/providers/preferences-provider"

// A user's personal in-app notification (user_notifications, written by the
// notification dispatcher). ORR-798: this is the feed the bell now reads for
// everyone — the old admin-only /api/admin/alerts left non-admins permanently
// empty. Admin system alerts are still shown, as a separate section, to admins.
export interface UserNotificationItem {
  id: string
  title: string
  message: string
  linkUrl: string | null
  readAt: string | null
  createdAt: string
}

export interface AdminAlert {
  id: string
  title: string
  message: string
  type: "info" | "warning" | "error" | "deadletter"
  created_at: string
  acknowledged_at: string | null
}

interface NotificationsDrawerProps {
  isAdmin?: boolean
}

function relativeTime(
  dateString: string,
  formatAbsolute: (value: string) => string,
): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatAbsolute(dateString)
}

const alertColorMap = {
  info: "bg-blue-500/10 border-blue-500/20",
  warning: "bg-amber-500/10 border-amber-500/20",
  error: "bg-red-500/10 border-red-500/20",
  deadletter: "bg-purple-500/10 border-purple-500/20",
}

export function NotificationsDrawer({ isAdmin = false }: NotificationsDrawerProps) {
  const { formatDate } = usePreferences()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<UserNotificationItem[]>([])
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const unackedAlerts = alerts.filter((a) => !a.acknowledged_at).length
  const totalUnread = unreadCount + unackedAlerts

  const fetchFeed = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/notifications?pageSize=20")
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return
        throw new Error("Failed to load notifications")
      }
      const json = await res.json()
      setItems((json.notifications as UserNotificationItem[]) ?? [])
      setUnreadCount((json.unreadCount as number) ?? 0)

      if (isAdmin) {
        const alertRes = await fetch("/api/admin/alerts?limit=20")
        if (alertRes.ok) {
          const { data } = await alertRes.json()
          setAlerts((data as AdminAlert[]) ?? [])
        }
      }
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen)
      if (isOpen) fetchFeed()
    },
    [fetchFeed],
  )

  const markRead = useCallback(async (id: string) => {
    setActing(id)
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error("Failed to mark read")
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
        ),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } finally {
      setActing(null)
    }
  }, [])

  const acknowledgeAlert = useCallback(async (id: string) => {
    setActing(id)
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error("Failed to acknowledge alert")
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, acknowledged_at: new Date().toISOString() } : a,
        ),
      )
    } finally {
      setActing(null)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    if (unreadCount > 0) {
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        })
        setItems((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        )
        setUnreadCount(0)
      } catch {
        // best-effort
      }
    }
    const unacked = alerts.filter((a) => !a.acknowledged_at)
    for (const a of unacked) {
      try {
        await fetch("/api/admin/alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: a.id }),
        })
      } catch {
        // continue
      }
    }
    if (unacked.length > 0) {
      setAlerts((prev) =>
        prev.map((a) => ({
          ...a,
          acknowledged_at: a.acknowledged_at ?? new Date().toISOString(),
        })),
      )
    }
  }, [unreadCount, alerts])

  const isEmpty = items.length === 0 && alerts.length === 0

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="relative" />}
      >
        <Bell className="size-5" />
        {totalUnread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription>
                {totalUnread > 0 ? `${totalUnread} unread` : "All caught up"}
              </SheetDescription>
            </div>
            {totalUnread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllRead}
                className="gap-1.5 text-xs"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {loading && isEmpty ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
              <AlertCircle className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchFeed}>
                Retry
              </Button>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
              <Bell className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div>
              <div className="divide-y">
                {items.map((n) => {
                  const isRead = !!n.readAt
                  const body = (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            isRead && "text-muted-foreground",
                          )}
                        >
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {relativeTime(n.createdAt, formatDate)}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 text-xs",
                          isRead
                            ? "text-muted-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {n.message}
                      </p>
                      {!isRead && (
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-2 text-[10px]"
                            onClick={(e) => {
                              e.preventDefault()
                              markRead(n.id)
                            }}
                            disabled={acting === n.id}
                          >
                            {acting === n.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <CheckCheck className="size-3" />
                            )}
                            Mark read
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "relative px-6 py-4 transition-colors",
                        !isRead && "bg-primary/5",
                      )}
                    >
                      {n.linkUrl ? (
                        <a
                          href={n.linkUrl}
                          className="flex items-start gap-3"
                          onClick={() => {
                            if (!isRead) markRead(n.id)
                          }}
                        >
                          {body}
                        </a>
                      ) : (
                        <div className="flex items-start gap-3">{body}</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {isAdmin && alerts.length > 0 && (
                <div className="border-t">
                  <p className="px-6 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    System alerts
                  </p>
                  <div className="divide-y">
                    {alerts.map((alert) => {
                      const isRead = !!alert.acknowledged_at
                      return (
                        <div
                          key={alert.id}
                          className={cn(
                            "relative px-6 py-4 transition-colors",
                            !isRead && alertColorMap[alert.type],
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                isRead && "text-muted-foreground",
                              )}
                            >
                              {alert.title}
                            </p>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {relativeTime(alert.created_at, formatDate)}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "mt-0.5 text-xs",
                              isRead
                                ? "text-muted-foreground/70"
                                : "text-muted-foreground",
                            )}
                          >
                            {alert.message}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] capitalize"
                            >
                              {alert.type}
                            </Badge>
                            {!isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 px-2 text-[10px]"
                                onClick={() => acknowledgeAlert(alert.id)}
                                disabled={acting === alert.id}
                              >
                                {acting === alert.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <CheckCheck className="size-3" />
                                )}
                                Mark read
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
