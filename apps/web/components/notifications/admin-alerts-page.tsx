"use client"

import { useCallback, useMemo, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { CheckCheck, Info, AlertTriangle, AlertCircle, XCircle, Loader2 } from "lucide-react"
import type { AdminAlert } from "@/lib/data/admin-alerts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface AdminAlertsPageProps {
  alerts: AdminAlert[]
  total: number
  acknowledgeAction: (id: string) => Promise<void>
  acknowledgeAllAction: () => Promise<void>
}

function relativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString()
}

const typeIcons: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  deadletter: XCircle,
}

const typeColors: Record<string, string> = {
  info: "text-info-fg",
  warning: "text-warning-fg",
  error: "text-destructive-fg",
  deadletter: "text-purple-500",
}

function getTypeBadgeVariant(type: string): "default" | "secondary" | "outline" | "destructive" {
  switch (type) {
    case "info": return "secondary"
    case "warning": return "outline"
    case "error": return "destructive"
    case "deadletter": return "default"
    default: return "outline"
  }
}

export function AdminAlertsPage({
  alerts,
  total,
  acknowledgeAction,
  acknowledgeAllAction,
}: AdminAlertsPageProps) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [showAcknowledged, setShowAcknowledged] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false
      if (!showAcknowledged && a.acknowledgedAt) return false
      return true
    })
  }, [alerts, typeFilter, showAcknowledged])

  const unreadCount = useMemo(
    () => alerts.filter((a) => !a.acknowledgedAt).length,
    [alerts],
  )

  const handleAcknowledgeOne = useCallback(
    async (id: string) => {
      setAcknowledgingIds((prev) => new Set(prev).add(id))
      try {
        await acknowledgeAction(id)
        router.refresh()
      } finally {
        setAcknowledgingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [acknowledgeAction, router],
  )

  const handleAcknowledgeAll = useCallback(async () => {
    setIsPending(true)
    try {
      await acknowledgeAllAction()
      setRowSelection({})
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }, [acknowledgeAllAction, router])

  const columns: ColumnDef<AdminAlert>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => {
          const type = row.getValue<string>("type")
          // eslint-disable-next-line security/detect-object-injection -- static record lookup
          const Icon = type in typeIcons ? typeIcons[type] : typeIcons.info
          // eslint-disable-next-line security/detect-object-injection -- static record lookup
          const iconColor = type in typeColors ? typeColors[type] : "text-muted-foreground"
          return (
            <div className="flex items-center gap-1.5">
              <Icon className={cn("size-3.5", iconColor)} />
              <Badge variant={getTypeBadgeVariant(type)} className="h-5 px-1.5 text-[10px] capitalize">
                {type}
              </Badge>
            </div>
          )
        },
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => {
          const alert = row.original
          return (
            <span className={cn("font-medium", alert.acknowledgedAt && "text-muted-foreground")}>
              {alert.title}
            </span>
          )
        },
      },
      {
        accessorKey: "message",
        header: "Message",
        cell: ({ row }) => {
          const alert = row.original
          return (
            <p className={cn("max-w-md truncate text-sm", alert.acknowledgedAt && "text-muted-foreground/70")}>
              {alert.message}
            </p>
          )
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {relativeTime(row.getValue<string>("createdAt"))}
          </span>
        ),
      },
      {
        accessorKey: "acknowledgedAt",
        header: "Status",
        cell: ({ row }) => {
          const acknowledgedAt = row.getValue<string | null>("acknowledgedAt")
          return acknowledgedAt ? (
            <span className="text-xs text-muted-foreground">
              Read {relativeTime(acknowledgedAt)}
            </span>
          ) : (
            <Badge variant="default" className="h-5 px-1.5 text-[10px]">
              Unread
            </Badge>
          )
        },
      },
      {
        id: "actions",
        header: "",
        size: 100,
        cell: ({ row }) => {
          const alert = row.original
          if (alert.acknowledgedAt) return null
          const isAcknowledging = acknowledgingIds.has(alert.id)
          return (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => handleAcknowledgeOne(alert.id)}
                disabled={isAcknowledging}
              >
                {isAcknowledging ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <CheckCheck className="size-3" />
                )}
                Mark read
              </Button>
            </div>
          )
        },
      },
    ],
    [handleAcknowledgeOne, acknowledgingIds],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  })

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, isSelected]) => isSelected)
        .map(([key]) => filtered.at(Number(key))?.id)
        .filter((id): id is string => !!id)
        .filter((id) => {
          const alert = alerts.find((a) => a.id === id)
          return alert && !alert.acknowledgedAt
        }),
    [rowSelection, filtered, alerts],
  )

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts &amp; Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} total alert{total !== 1 ? "s" : ""} &middot; {unreadCount} unread
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAcknowledgeAll}
              disabled={isPending}
              className="gap-1.5"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCheck className="size-3.5" />
              )}
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-b px-6 py-2">
        <Select value={typeFilter} onValueChange={(val) => setTypeFilter(val ?? "all")}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="deadletter">Deadletter</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={showAcknowledged}
            onCheckedChange={(v) => setShowAcknowledged(!!v)}
          />
          Show acknowledged
        </label>
      </div>

      <div className="flex-1 p-6">
        <div className="space-y-4">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    for (const id of selectedIds) {
                      await acknowledgeAction(id)
                    }
                    setRowSelection({})
                    router.refresh()
                  }}
                  className="gap-1.5"
                >
                  <CheckCheck className="size-3.5" />
                  Mark selected as read
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.original.id}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No alerts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
