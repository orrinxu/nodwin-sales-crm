"use client"

import * as React from "react"
import {
  flexRender,
  type Table as TanStackTable,
} from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import type { LucideIcon } from "lucide-react"

interface DataTableToolbarProps {
  children: React.ReactNode
  className?: string
}

export function DataTableToolbar({ children, className }: DataTableToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  )
}

interface DataTableBulkBarProps {
  selectedCount: number
  children: React.ReactNode
  className?: string
}

export function DataTableBulkBar({
  selectedCount,
  children,
  className,
}: DataTableBulkBarProps) {
  if (selectedCount === 0) return null
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">
        {selectedCount} selected
      </span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  )
}

interface DataTableContentProps<TData> {
  table: TanStackTable<TData>
  columnsLength: number
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: LucideIcon
  emptyAction?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function DataTableContent<TData>({
  table,
  columnsLength,
  emptyTitle = "No results",
  emptyDescription,
  emptyIcon,
  emptyAction,
  className,
}: DataTableContentProps<TData>) {
  const rows = table.getRowModel().rows

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className="py-12"
      />
    )
  }

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)}>
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
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

interface DataTableProps<TData> {
  table: TanStackTable<TData>
  columnsLength: number
  toolbar?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: LucideIcon
  emptyAction?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function DataTable<TData>({
  table,
  columnsLength,
  toolbar,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  className,
}: DataTableProps<TData>) {
  return (
    <div className={cn("space-y-4", className)}>
      {toolbar}
      <DataTableContent
        table={table}
        columnsLength={columnsLength}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyIcon={emptyIcon}
        emptyAction={emptyAction}
      />
    </div>
  )
}

/**
 * Helper: renders a sortable column header button.
 */
interface SortHeaderProps {
  label: string
  sorted: "asc" | "desc" | false
  onToggle: () => void
  align?: "left" | "right"
}

export function SortHeader({
  label,
  sorted,
  onToggle,
  align = "left",
}: SortHeaderProps) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 h-8 rounded-md px-2 text-sm font-medium text-foreground hover:bg-muted transition-colors",
          align === "right" ? "-mr-2" : "-ml-2",
          sorted ? "text-brand-600" : "",
        )}
        onClick={onToggle}
      >
        {label}
        <span className="text-xs text-muted-foreground ml-0.5">
          {sorted === "asc" ? "\u2191" : sorted === "desc" ? "\u2193" : "\u2195"}
        </span>
      </button>
    </div>
  )
}
