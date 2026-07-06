"use client"

import { useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  getRowId?: (row: TData) => string
  /** Controlled sorting; omit to let the table manage it internally. */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  /** Controlled row selection; omit to disable selection. */
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  enableRowSelection?: boolean
  onRowClick?: (row: TData) => void
  /** Rendered in a full-span cell when there are no rows. */
  emptyState?: React.ReactNode
  className?: string
}

/**
 * Generic table wrapper over @tanstack/react-table + the base <Table>
 * primitives. Sorting and selection can be controlled (pass state + handler) or
 * left to the table. Callers own column definitions.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  enableRowSelection,
  onRowClick,
  emptyState,
  className,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const isSortingControlled = sorting !== undefined

  // TanStack Table is a compatible library; the hooks lint rule false-positives.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: isSortingControlled ? sorting : internalSorting,
      ...(rowSelection !== undefined ? { rowSelection } : {}),
    },
    enableRowSelection: enableRowSelection ?? rowSelection !== undefined,
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
    onSortingChange: onSortingChange ?? setInternalSorting,
    ...(onRowSelectionChange ? { onRowSelectionChange } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows

  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                style={{
                  width:
                    header.getSize() !== 150 ? header.getSize() : undefined,
                }}
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
        {rows.length > 0 ? (
          rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(onRowClick && "cursor-pointer")}
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
              {emptyState ?? "No results."}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
