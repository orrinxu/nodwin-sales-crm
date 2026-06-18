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

import {
  NON_TERMINAL_STAGES,
  TERMINAL_STAGES,
  type DealStage,
} from "@/lib/opportunity"
import { getStageLabel, type OpportunityRecord } from "@/lib/data/opportunities.types"
import { Money } from "@/lib/money"
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
import { Trash2Icon, ArrowUpDownIcon } from "lucide-react"

interface OpportunityListTableProps {
  opportunities: OpportunityRecord[]
  stageLabels: Record<string, string>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  bulkUpdateStageAction: (input: {
    ids: string[]
    stage: string
  }) => Promise<void>
}

const ALL_STAGES = [...NON_TERMINAL_STAGES, ...TERMINAL_STAGES]

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

export function OpportunityListTable({
  opportunities,
  stageLabels,
  bulkDeleteAction,
  bulkUpdateStageAction,
}: OpportunityListTableProps) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStageDialog, setShowStageDialog] = useState(false)
  const [targetStage, setTargetStage] = useState<DealStage>("qualify")
  const [isPending, setIsPending] = useState(false)

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, isSelected]) => isSelected)
        .map(([key]) => opportunities.at(Number(key))?.id)
        .filter((id): id is string => !!id),
    [rowSelection, opportunities],
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
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("name")}</span>
        ),
      },
      {
        accessorKey: "accountName",
        header: "Account",
        cell: ({ row }) => row.getValue("accountName") ?? "—",
      },
      {
        accessorKey: "stage",
        header: "Stage",
        cell: ({ row }) => getStageLabel(row.getValue("stage"), stageLabels),
      },
      {
        accessorKey: "amount",
        header: () => (
          <div className="text-right">Amount</div>
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
      },
      {
        accessorKey: "ownerName",
        header: "Owner",
        cell: ({ row }) => row.getValue("ownerName") ?? "—",
      },
      {
        accessorKey: "closeDate",
        header: "Close Date",
        cell: ({ row }) => formatDate(row.getValue("closeDate")),
      },
    ],
    [],
  )

  // TanStack Table is a compatible library; this is a known false positive.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: opportunities,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
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
                  No opportunities yet. Create one to get started.
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
                    {getStageLabel(stage, stageLabels)}
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
