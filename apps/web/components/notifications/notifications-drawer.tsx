"use client"

import { useState, useCallback } from "react"
import { Bell, CheckCheck, Loader2, Info, AlertTriangle, AlertCircle, XCircle } from "lucide-react"
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

export interface NotificationAlert {
  id: string
  title: string
  message: string
  type: "info" | "warning" | "error" | "deadletter"
  created_at: string
  acknowledged_at: string | null
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

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  deadletter: XCircle,
}

const colorMap = {
  info: "text-blue-400",
  warning: "text-amber-400",
  error: "text-red-400",
  deadletter: "text-purple-400",
}

const bgColorMap = {
  info: "bg-blue-500/10 border-blue-500/20",
  warning: "bg-amber-500/10 border-amber-500/20",
  error: "bg-red-500/10 border-red-500/20",
  deadletter: "bg-purple-500/10 border-purple-500/20",
}

export function NotificationsDrawer() {
  const { formatDate } = usePreferences()
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<NotificationAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/alerts?limit=20")
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return
        throw new Error("Failed to load alerts")
      }
      const { data } = await res.json()
      setAlerts((data as NotificationAlert[]) ?? [])
      setUnreadCount((data as NotificationAlert[])?.filter((a) => !a.acknowledged_at).length ?? 0)
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen)
      if (isOpen) {
        fetchAlerts()
      }
    },
    [fetchAlerts],
  )

  const acknowledgeAlert = useCallback(
    async (id: string) => {
      setAcknowledging(id)
      try {
        const res = await fetch("/api/admin/alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
        if (!res.ok) throw new Error("Failed to acknowledge alert")
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, acknowledged_at: new Date().toISOString() } : a)),
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } finally {
        setAcknowledging(null)
      }
    },
    [],
  )

  const acknowledgeAll = useCallback(async () => {
    const unreadIds = alerts.filter((a) => !a.acknowledged_at).map((a) => a.id)
    if (unreadIds.length === 0) return

    for (const id of unreadIds) {
      try {
        await fetch("/api/admin/alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
      } catch {
        // continue to next
      }
    }
    setAlerts((prev) =>
      prev.map((a) => ({ ...a, acknowledged_at: a.acknowledged_at ?? new Date().toISOString() })),
    )
    setUnreadCount(0)
  }, [alerts])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" />
        }
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
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
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : "All caught up"}
              </SheetDescription>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={acknowledgeAll}
                className="gap-1.5 text-xs"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
              <AlertCircle className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchAlerts}>
                Retry
              </Button>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 px-6 text-center">
              <Bell className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => {
                const Icon = iconMap[alert.type]
                const isRead = !!alert.acknowledged_at
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "relative px-6 py-4 transition-colors",
                      !isRead && bgColorMap[alert.type],
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", colorMap[alert.type])} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm font-medium", isRead && "text-muted-foreground")}>
                            {alert.title}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {relativeTime(alert.created_at, formatDate)}
                          </span>
                        </div>
                        <p className={cn("mt-0.5 text-xs", isRead ? "text-muted-foreground/70" : "text-muted-foreground")}>
                          {alert.message}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                            {alert.type}
                          </Badge>
                          {!isRead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-2 text-[10px]"
                              onClick={() => acknowledgeAlert(alert.id)}
                              disabled={acknowledging === alert.id}
                            >
                              {acknowledging === alert.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <CheckCheck className="size-3" />
                              )}
                              Mark read
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
