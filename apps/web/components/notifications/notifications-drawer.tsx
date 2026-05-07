"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Info,
  Skull,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type AdminAlert = {
  id: string
  title: string
  message: string
  type: "info" | "warning" | "error" | "deadletter"
  metadata: Record<string, unknown>
  acknowledged_at: string | null
  created_by: string
  created_at: string
}

const typeIcons = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  deadletter: Skull,
} as const

const typeStyles = {
  info: "text-blue-500 bg-blue-500/10",
  warning: "text-amber-500 bg-amber-500/10",
  error: "text-red-500 bg-red-500/10",
  deadletter: "text-purple-500 bg-purple-500/10",
} as const

function relativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function NotificationsDrawer() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const unreadCount = alerts.filter((a) => !a.acknowledged_at).length

  useEffect(() => {
    fetch("/api/admin/alerts?limit=50")
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403) {
            setAlerts([])
            return null
          }
          throw new Error("Failed to fetch alerts")
        }
        return res.json()
      })
      .then((json) => {
        if (json) setAlerts(json.data ?? [])
      })
      .catch(() => {
        setAlerts([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("admin_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_alerts" },
        (payload) => {
          const newAlert = payload.new as AdminAlert
          setAlerts((prev) => [newAlert, ...prev])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const acknowledgeAlert = useCallback(async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, acknowledged_at: new Date().toISOString() } : a,
      ),
    )

    try {
      const res = await fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) throw new Error("Failed to acknowledge")
    } catch {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, acknowledged_at: null } : a,
        ),
      )
    }
  }, [])

  const acknowledgeAll = useCallback(async () => {
    const unreadIds = alerts
      .filter((a) => !a.acknowledged_at)
      .map((a) => a.id)

    if (unreadIds.length === 0) return

    const now = new Date().toISOString()
    setAlerts((prev) =>
      prev.map((a) =>
        !a.acknowledged_at ? { ...a, acknowledged_at: now } : a,
      ),
    )

    const failedIds: string[] = []

    for (const id of unreadIds) {
      try {
        const res = await fetch("/api/admin/alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
        if (!res.ok) failedIds.push(id)
      } catch {
        failedIds.push(id)
      }
    }

    if (failedIds.length > 0) {
      setAlerts((prev) =>
        prev.map((a) =>
          failedIds.includes(a.id) ? { ...a, acknowledged_at: null } : a,
        ),
      )
    }
  }, [alerts])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold leading-none text-destructive-foreground px-0.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <SheetContent side="right" className="flex flex-col gap-0 p-0 w-80 sm:max-w-80">
        <SheetHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <SheetTitle>Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={acknowledgeAll}
              className="gap-1"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((alert) => {
                const TypeIcon = typeIcons[alert.type]
                const style = typeStyles[alert.type]
                return (
                  <li
                    key={alert.id}
                    className={cn(
                      "group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                      !alert.acknowledged_at && "bg-muted/20",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        style ?? typeStyles.info,
                      )}
                    >
                      <TypeIcon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm",
                          !alert.acknowledged_at && "font-medium",
                        )}
                      >
                        {alert.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {alert.message}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="size-3 text-muted-foreground/60" />
                        <span className="text-[11px] text-muted-foreground/60">
                          {relativeTime(alert.created_at)}
                        </span>
                      </div>
                    </div>
                    {!alert.acknowledged_at && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => acknowledgeAlert(alert.id)}
                        aria-label="Mark as read"
                      >
                        <Check className="size-3.5" />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
