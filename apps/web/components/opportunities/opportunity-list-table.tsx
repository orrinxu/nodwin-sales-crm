"use client"

import { useCallback, useMemo, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"

import {
  NON_TERMINAL_STAGES,
  TERMINAL_STAGES,
  type DealStage,
} from "@/lib/opportunity"
import { getStageLabel, type OpportunityRecord } from "@/lib/data/opportunities.types"
import { Money } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2Icon, ArrowUpDownIcon, SearchIcon, XIcon } from "lucide-react"

interface OpportunityListTableProps {
  opportunities: OpportunityRecord[]
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  bulkUpdateStageAction: (input: {
    ids: string[]
    stage: string
  }) => Promise<void>
}

const ALL_STAGES = [...NON_TERMINAL_STAGES, ...TERMINAL_STAGES]
const UNASSIGNED = "__unassigned__"

function formatCurrency(amount: string, currency: string): string {
  try {
    return Money.fromAmount(amount, currency).toDisplay()
  } catch {
    return `${currency} ${amount}`
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

// Raw minor-unit value for sorting; never throws. Cross-currency comparison is a
// rough total order (fine for a list sort — the dashboards do FX conversion).
function centsOf(opp: OpportunityRecord): number {
  try {
    return Money.fromAmount(opp.amount, opp.currency).cents
  } catch {
    return 0
  }
}

function SortHeader({
  label,
  onClick,
  align = "left",
}: {
  label: string
  onClick: () => void
  align?: "left" | "right"
}) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <Button
        variant="ghost"
        className={align === "right" ? "-mr-3 h-8" : "-ml-3 h-8"}
        onClick={onClick}
      >
        {label}
        <ArrowUpDownIcon className="ml-2 size-4" />
      </Button>
    </div>
  )
}

export function OpportunityListTable({
  opportunities,
  bulkDeleteAction,
  bulkUpdateStageAction,
}: OpportunityListTableProps) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStageDialog, setShowStageDialog] = useState(false)
  const [targetStage, setTargetStage] = useState<DealStage>("qualify")
  const [isPending, setIsPending] = useState(false)

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const o of opportunities) {
      const id = o.ownerUserId ?? UNASSIGNED
      if (!seen.has(id)) seen.set(id, o.ownerName ?? "Unassigned")
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [opportunities])

  const filteredOpportunities = useMemo(() => {
    let result = opportunities
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.accountName?.toLowerCase().includes(q) ?? false),
      )
    }
    if (stageFilter !== "all") {
      result = result.filter((o) => o.stage === stageFilter)
    }
    if (ownerFilter !== "all") {
      result = result.filter((o) => (o.ownerUserId ?? UNASSIGNED) === ownerFilter)
    }
    return result
  }, [opportunities, searchQuery, stageFilter, ownerFilter])

  const hasActiveFilters =
    searchQuery.trim() !== "" || stageFilter !== "all" || ownerFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setStageFilter("all")
    setOwnerFilter("all")
  }, [])

  // getRowId keys the selection by opportunity id, so it survives filtering/sorting.
  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    [rowSelection],
  )

  const columns: ColumnDef<OpportunityRecord>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
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
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortHeader
            label="Name"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <button
            className="text-left font-medium hover:underline"
            onClick={() => router.push(`/opportunities/${row.original.id}`)}
          >
            {row.getValue("name")}
          </button>
        ),
      },
      {
        accessorKey: "accountName",
        header: ({ column }) => (
          <SortHeader
            label="Account"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => row.getValue("accountName") ?? "—",
      },
      {
        accessorKey: "stage",
        header: ({ column }) => (
          <SortHeader
            label="Stage"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => getStageLabel(row.getValue("stage")),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <SortHeader
            label="Amount"
            align="right"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const amount = row.getValue<string>("amount")
          const currency = row.original.currency
          return (
            <div className="text-right tabular-nums">
              {formatCurrency(amount, currency)}
            </div>
          )
        },
        sortingFn: (rowA, rowB) => {
          const a = centsOf(rowA.original)
          const b = centsOf(rowB.original)
          return a < b ? -1 : a > b ? 1 : 0
        },
      },
      {
        accessorKey: "ownerName",
        header: ({ column }) => (
          <SortHeader
            label="Owner"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => row.getValue("ownerName") ?? "—",
      },
      {
        accessorKey: "closeDate",
        header: ({ column }) => (
          <SortHeader
            label="Close Date"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => formatDate(row.getValue("closeDate")),
      },
    ],
    [router],
  )

  // TanStack Table is a compatible library; this is a known false positive.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredOpportunities,
    columns,
    state: { rowSelection, sorting },
    enableRowSelection: true,
    getRowId: (row) => row.id,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    setIsPending(true)
    try {
      await bulkDeleteAction({ ids: selectedIds })
      setRowSelection({})
      setShowDeleteDialog(false)
      router.refresh()
    } catch {
      // handled by caller
    } finally {
      setIsPending(false)
    }
  }, [selectedIds, bulkDeleteAction, router])

  const handleBulkStageChange = useCallback(async () => {
    if (selectedIds.length === 0) return
    setIsPending(true)
    try {
      await bulkUpdateStageAction({ ids: selectedIds, stage: targetStage })
      setRowSelection({})
      setShowStageDialog(false)
      router.refresh()
    } catch {
      // handled by caller
    } finally {
      setIsPending(false)
    }
  }, [selectedIds, targetStage, bulkUpdateStageAction, router])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search opportunities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {ALL_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {getStageLabel(stage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={(v) => setOwnerFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {ownerOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon />
            Clear
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {selectedIds.length} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStageDialog(true)}
            >
              <ArrowUpDownIcon />
              Change Stage
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2Icon />
              Delete
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
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
                  {hasActiveFilters
                    ? "No opportunities match your filters."
                    : "No opportunities yet. Create one to get started."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Opportunities</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.length} opportunity
              {selectedIds.length !== 1 ? "ies" : "y"}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Stage</DialogTitle>
            <DialogDescription>
              Move {selectedIds.length} opportunity
              {selectedIds.length !== 1 ? "ies" : "y"} to a new stage.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select
              value={targetStage}
              onValueChange={(v) => setTargetStage(v as DealStage)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {getStageLabel(stage)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStageDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkStageChange} disabled={isPending}>
              {isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
