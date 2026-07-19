"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
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
import { OwnerLink } from "@/components/people/owner-link"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/primitives/data-table"
import { FilterBar, FilterField } from "@/components/primitives/filter-bar"
import { ListPagination } from "@/components/primitives/list-pagination"
import { StageBadge } from "@/components/primitives/stage-badge"
import { StatusBadge } from "@/components/primitives/status-badge"
import { overdueLabel, staleLabel } from "@/lib/opportunity/deal-health"
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
import {
  Trash2Icon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { SavedViewsMenu } from "@/components/opportunities/saved-views-menu"
import { useListQuery } from "@/lib/list/use-list-query"
import type {
  SavedViewRecord,
  SavedViewFilters,
  SavedViewScope,
} from "@/lib/data/saved-views"
import { usePreferences } from "@/components/providers/preferences-provider"

interface OwnerOption {
  id: string
  name: string
}

interface OpportunityListTableProps {
  opportunities: OpportunityRecord[]
  /** Total rows matching the active filters, across all pages. */
  totalCount: number
  /** 1-based current page. */
  page: number
  pageSize: number
  /** Full owner list for the filter dropdown — server-supplied so it isn't
   *  limited to the owners visible on the current page. */
  ownerOptions: OwnerOption[]
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  bulkUpdateStageAction: (input: {
    ids: string[]
    stage: string
  }) => Promise<void>
  /** Saved-views support — omitted (all four) disables the Views control. */
  savedViews?: SavedViewRecord[]
  savedViewScope?: SavedViewScope
  saveViewAction?: (input: {
    name: string
    scope: SavedViewScope
    filters: SavedViewFilters
  }) => Promise<SavedViewRecord>
  deleteSavedViewAction?: (id: string) => Promise<void>
}

const ALL_STAGES = [...NON_TERMINAL_STAGES, ...TERMINAL_STAGES]

// URL sort tokens ↔ the TanStack column ids saved views persist. Kept in sync so
// a view saved before/after this rewrite maps cleanly to a server sort param.
// Maps (not plain objects) so variable-key lookups aren't object-injection sinks.
const COLUMN_TO_SORT = new Map<string, string>([
  ["name", "name"],
  ["accountName", "account"],
  ["stage", "stage"],
  ["amount", "amount"],
  ["ownerName", "owner"],
  ["closeDate", "closeDate"],
])
const SORT_TO_COLUMN = new Map<string, string>(
  Array.from(COLUMN_TO_SORT, ([col, sort]) => [sort, col]),
)

const SEARCH_DEBOUNCE_MS = 350

function formatCurrency(amount: string, currency: string): string {
  try {
    return Money.fromAmount(amount, currency).toDisplay()
  } catch {
    return `${currency} ${amount}`
  }
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string
  active: boolean
  direction: "asc" | "desc"
  onClick: () => void
  align?: "left" | "right"
}) {
  const Icon = !active ? ArrowUpDownIcon : direction === "asc" ? ArrowUpIcon : ArrowDownIcon
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <Button
        variant="ghost"
        className={align === "right" ? "-mr-3 h-8" : "-ml-3 h-8"}
        onClick={onClick}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon className={active ? "ml-2 size-4" : "ml-2 size-4 text-muted-foreground"} />
      </Button>
    </div>
  )
}

export function OpportunityListTable({
  opportunities,
  totalCount,
  page,
  pageSize,
  ownerOptions,
  bulkDeleteAction,
  bulkUpdateStageAction,
  savedViews,
  savedViewScope,
  saveViewAction,
  deleteSavedViewAction,
}: OpportunityListTableProps) {
  const router = useRouter()
  const { formatDate } = usePreferences()
  const { searchParams, setParams } = useListQuery()

  // Filter / sort state is read from the URL — the server already applied it.
  const urlSearch = searchParams.get("q") ?? ""
  const stageFilter = searchParams.get("stage") ?? "all"
  const ownerFilter = searchParams.get("owner") ?? "all"
  const activeSort = searchParams.get("sort")
  const activeDir = (searchParams.get("dir") === "asc" ? "asc" : "desc") as "asc" | "desc"

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [searchInput, setSearchInput] = useState(urlSearch)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStageDialog, setShowStageDialog] = useState(false)
  const [targetStage, setTargetStage] = useState<DealStage>("qualify")
  const [isPending, setIsPending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)

  // Clear the row selection whenever the visible set changes (page, filters,
  // search, or sort). Otherwise "3 selected" can retain off-screen rows and a
  // bulk delete would remove records the user can no longer see.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing selection is the intended reaction to a visible-set change
    setRowSelection({})
  }, [page, stageFilter, ownerFilter, urlSearch, activeSort, activeDir])

  // Debounce the search box → URL so each keystroke doesn't fire a navigation.
  // The input is seeded from the URL on mount and re-synced explicitly by the
  // clear / apply-view handlers, so no URL→input effect is needed here.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === urlSearch) return
    const t = setTimeout(() => {
      setParams({ q: trimmed || null }, { resetPage: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput, urlSearch, setParams])

  const hasActiveFilters =
    urlSearch !== "" || stageFilter !== "all" || ownerFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchInput("")
    setParams(
      { q: null, stage: null, owner: null, sort: null, dir: null },
      { resetPage: true },
    )
  }, [setParams])

  const pushSort = useCallback(
    (columnId: string) => {
      const sortToken = COLUMN_TO_SORT.get(columnId)
      if (!sortToken) return
      // Same column → flip direction; new column → start ascending.
      const nextDir = activeSort === sortToken && activeDir === "asc" ? "desc" : "asc"
      setParams({ sort: sortToken, dir: nextDir }, { resetPage: true })
    },
    [activeSort, activeDir, setParams],
  )

  // Serialize current URL filter/sort into a saved view, and restore one on apply.
  const currentFilters = useMemo<SavedViewFilters>(() => {
    const filters: SavedViewFilters = {}
    if (urlSearch) filters.searchQuery = urlSearch
    if (stageFilter !== "all") filters.stageFilter = stageFilter
    if (ownerFilter !== "all") filters.ownerFilter = ownerFilter
    const sortColumn = activeSort ? SORT_TO_COLUMN.get(activeSort) : undefined
    if (sortColumn) {
      filters.sorting = [{ id: sortColumn, desc: activeDir === "desc" }]
    }
    return filters
  }, [urlSearch, stageFilter, ownerFilter, activeSort, activeDir])

  const applyView = useCallback(
    (filters: SavedViewFilters) => {
      const sort = filters.sorting?.[0]
      const sortToken = sort ? COLUMN_TO_SORT.get(sort.id) : undefined
      setSearchInput(filters.searchQuery ?? "")
      setParams(
        {
          q: filters.searchQuery ?? null,
          stage: filters.stageFilter ?? null,
          owner: filters.ownerFilter ?? null,
          sort: sortToken ?? null,
          dir: sortToken ? (sort!.desc ? "desc" : "asc") : null,
        },
        { resetPage: true },
      )
    },
    [setParams],
  )

  const savedViewsEnabled =
    savedViewScope != null &&
    saveViewAction != null &&
    deleteSavedViewAction != null

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
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "name",
        header: () => (
          <SortHeader
            label="Name"
            active={activeSort === "name"}
            direction={activeDir}
            onClick={() => pushSort("name")}
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
        header: () => (
          <SortHeader
            label="Account"
            active={activeSort === "account"}
            direction={activeDir}
            onClick={() => pushSort("accountName")}
          />
        ),
        cell: ({ row }) => row.getValue("accountName") ?? "—",
      },
      {
        accessorKey: "stage",
        header: () => (
          <SortHeader
            label="Stage"
            active={activeSort === "stage"}
            direction={activeDir}
            onClick={() => pushSort("stage")}
          />
        ),
        cell: ({ row }) => <StageBadge stage={row.getValue<DealStage>("stage")} />,
      },
      {
        id: "health",
        header: "Health",
        // Batched, server-computed health signals (see lib/data/deal-health.ts).
        // A healthy / terminal deal has no signal → an em dash.
        cell: ({ row }) => {
          const health = row.original.health
          if (!health || (!health.overdue && !health.stale)) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <div className="flex flex-wrap items-center gap-1">
              {health.overdue ? (
                <StatusBadge tone="destructive">
                  {overdueLabel(health.overdue.days)}
                </StatusBadge>
              ) : null}
              {health.stale ? (
                <StatusBadge tone="warning">
                  {staleLabel(health.stale.days)}
                </StatusBadge>
              ) : null}
            </div>
          )
        },
        enableSorting: false,
      },
      {
        accessorKey: "amount",
        header: () => (
          <SortHeader
            label="Amount"
            align="right"
            active={activeSort === "amount"}
            direction={activeDir}
            onClick={() => pushSort("amount")}
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
      },
      {
        accessorKey: "ownerName",
        header: () => (
          <SortHeader
            label="Owner"
            active={activeSort === "owner"}
            direction={activeDir}
            onClick={() => pushSort("ownerName")}
          />
        ),
        cell: ({ row }) => (
          <OwnerLink
            userId={row.original.ownerUserId}
            name={row.original.ownerName}
            fallback="—"
          />
        ),
      },
      {
        accessorKey: "closeDate",
        header: () => (
          <SortHeader
            label="Close Date"
            active={activeSort === "closeDate"}
            direction={activeDir}
            onClick={() => pushSort("closeDate")}
          />
        ),
        cell: ({ row }) => formatDate(row.getValue("closeDate"), "—"),
      },
    ],
    [router, formatDate, activeSort, activeDir, pushSort],
  )

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    setIsPending(true)
    setDeleteError(null)
    try {
      await bulkDeleteAction({ ids: selectedIds })
      setRowSelection({})
      setShowDeleteDialog(false)
      router.refresh()
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete opportunities.",
      )
    } finally {
      setIsPending(false)
    }
  }, [selectedIds, bulkDeleteAction, router])

  const handleBulkStageChange = useCallback(async () => {
    if (selectedIds.length === 0) return
    setIsPending(true)
    setStageError(null)
    try {
      await bulkUpdateStageAction({ ids: selectedIds, stage: targetStage })
      setRowSelection({})
      setShowStageDialog(false)
      router.refresh()
    } catch (error) {
      setStageError(
        error instanceof Error ? error.message : "Failed to update stage.",
      )
    } finally {
      setIsPending(false)
    }
  }, [selectedIds, targetStage, bulkUpdateStageAction, router])

  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterField label="Search" htmlFor="opp-search" className="flex-1 sm:max-w-xs">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="opp-search"
              placeholder="Search opportunities..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8"
            />
          </div>
        </FilterField>
        <FilterField label="Stage" htmlFor="opp-stage-filter">
          <Select
            value={stageFilter}
            onValueChange={(v) => setParams({ stage: v === "all" ? null : v }, { resetPage: true })}
          >
            <SelectTrigger id="opp-stage-filter" className="w-[180px]">
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
        </FilterField>
        <FilterField label="Owner" htmlFor="opp-owner-filter">
          <Select
            value={ownerFilter}
            onValueChange={(v) => setParams({ owner: v === "all" ? null : v }, { resetPage: true })}
          >
            <SelectTrigger id="opp-owner-filter" className="w-[180px]">
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
        </FilterField>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon />
            Clear
          </Button>
        )}
        {savedViewsEnabled ? (
          <div className="ml-auto">
            <SavedViewsMenu
              savedViews={savedViews ?? []}
              scope={savedViewScope}
              currentFilters={currentFilters}
              canSave={hasActiveFilters || activeSort != null}
              onApply={applyView}
              saveViewAction={saveViewAction}
              deleteSavedViewAction={deleteSavedViewAction}
            />
          </div>
        ) : null}
      </FilterBar>

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

      <Card className="p-0">
        <DataTable
          columns={columns}
          data={opportunities}
          getRowId={(row) => row.id}
          manualSorting
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          enableRowSelection
          emptyState={
            hasActiveFilters
              ? "No opportunities match your filters."
              : "No opportunities yet. Create one to get started."
          }
          footer={
            <ListPagination
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              noun={{ singular: "opportunity", plural: "opportunities" }}
              onPageChange={(p) => setParams({ page: p <= 1 ? null : String(p) })}
            />
          }
        />
      </Card>

      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open)
          if (!open) setDeleteError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Opportunities</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.length} opportunit
              {selectedIds.length !== 1 ? "ies" : "y"}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {deleteError}
            </p>
          ) : null}
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

      <Dialog
        open={showStageDialog}
        onOpenChange={(open) => {
          setShowStageDialog(open)
          if (!open) setStageError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Stage</DialogTitle>
            <DialogDescription>
              Move {selectedIds.length} opportunit
              {selectedIds.length !== 1 ? "ies" : "y"} to a new stage.
            </DialogDescription>
          </DialogHeader>
          {stageError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {stageError}
            </p>
          ) : null}
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
