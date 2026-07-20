"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import {
  Search,
  Trash2Icon,
  Building2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Card } from "@/components/ui/card"
import { ListPagination } from "@/components/primitives/list-pagination"
import { AccountForm } from "@/components/accounts/account-form"
import { AccountGenerator } from "@/components/accounts/account-generator"
import type {
  AccountListRecord,
  AccountCreateInput,
  AccountRecord,
  BulkDeleteAccountsResult,
} from "@/lib/data/accounts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import type { TaxIdType } from "@/lib/data/account-tax-ids"
import type { TaxIdRow } from "@/components/accounts/tax-ids-editor"
import type { EntityOption } from "@/components/entity-combobox"
import { useListQuery } from "@/lib/list/use-list-query"
import { usePreferences } from "@/components/providers/preferences-provider"

// Sort tokens = the AccountSortColumn values the server understands.
const SORT_COLUMNS = new Set(["name", "industry", "country", "createdAt"])
const SEARCH_DEBOUNCE_MS = 350

interface AccountsListProps {
  accounts: AccountListRecord[]
  /** Total rows matching the active filters, across all pages. */
  totalCount: number
  /** 1-based current page. */
  page: number
  pageSize: number
  industryOptions: string[]
  ownerOptions: EntityOption[]
  accountOptions: EntityOption[]
  fieldDefinitions?: FieldDefinition[]
  taxIdTypes?: TaxIdType[]
  currentUserId?: string
  /** Server-side account typeahead (ORR-767) for the create form's parent picker. */
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
  createAction: (input: AccountCreateInput) => Promise<AccountRecord>
  saveTaxIdsAction?: (accountId: string, input: { taxIds: TaxIdRow[] }) => Promise<void>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<BulkDeleteAccountsResult>
  // ── Account Generator (ORR-735) — optional; when present the header shows the
  //    generator (chooser → note → draft → review) instead of a blank form. ──
  generateAction?: (input: {
    text?: string
    images?: { mimeType: string; dataBase64: string }[]
  }) => Promise<import("@/app/(crm)/accounts/generate-actions").GenerateAccountResult>
  extractFileAction?: (formData: FormData) => Promise<{ ok: boolean; text?: string; error?: string }>
  // ORR-741: voice-note transcription (present only when configured + enabled).
  transcribeAction?: (formData: FormData) => Promise<{ ok: boolean; text?: string; unconfigured?: boolean; unavailable?: boolean; error?: string }>
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: "asc" | "desc"
  onClick: () => void
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown
  return (
    <Button
      variant="ghost"
      className="-ml-3 h-8 data-[sorted]:text-foreground"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon className={active ? "ml-2 size-4" : "ml-2 size-4 text-muted-foreground"} />
    </Button>
  )
}

export function AccountsList({
  accounts,
  totalCount,
  page,
  pageSize,
  industryOptions,
  ownerOptions,
  accountOptions,
  fieldDefinitions = [],
  taxIdTypes = [],
  currentUserId,
  searchAccountsAction,
  createAction,
  saveTaxIdsAction,
  bulkDeleteAction,
  generateAction,
  extractFileAction,
  transcribeAction,
}: AccountsListProps) {
  const router = useRouter()
  const { formatDate } = usePreferences()
  const { searchParams, setParams } = useListQuery()

  // Filter / sort state comes from the URL — the server already applied it.
  const urlSearch = searchParams.get("q") ?? ""
  const industryFilter = searchParams.get("industry") ?? "all"
  const ownerFilter = searchParams.get("owner") ?? "all"
  const activeSort = searchParams.get("sort")
  const activeDir = (searchParams.get("dir") === "desc" ? "desc" : "asc") as "asc" | "desc"

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(urlSearch)

  // Debounce the search box → URL. Seeded from the URL on mount and re-synced by
  // the clear handler, so no URL→input effect is needed.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === urlSearch) return
    const t = setTimeout(() => {
      setParams({ q: trimmed || null }, { resetPage: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput, urlSearch, setParams])

  const pushSort = useCallback(
    (columnId: string) => {
      if (!SORT_COLUMNS.has(columnId)) return
      const nextDir = activeSort === columnId && activeDir === "asc" ? "desc" : "asc"
      setParams({ sort: columnId, dir: nextDir }, { resetPage: true })
    },
    [activeSort, activeDir, setParams],
  )

  // getRowId keys the selection by account id, so it survives paging/sorting.
  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, isSelected]) => isSelected)
        .map(([id]) => id),
    [rowSelection],
  )

  const columns: ColumnDef<AccountListRecord>[] = useMemo(
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
            className="font-medium hover:underline text-left"
            onClick={() => router.push(`/accounts/${row.original.id}`)}
          >
            {row.getValue("name")}
          </button>
        ),
      },
      {
        accessorKey: "industry",
        header: () => (
          <SortHeader
            label="Industry"
            active={activeSort === "industry"}
            direction={activeDir}
            onClick={() => pushSort("industry")}
          />
        ),
        cell: ({ row }) => row.getValue("industry") ?? "—",
      },
      {
        accessorKey: "country",
        header: () => (
          <SortHeader
            label="Country"
            active={activeSort === "country"}
            direction={activeDir}
            onClick={() => pushSort("country")}
          />
        ),
        cell: ({ row }) => row.getValue("country") ?? "—",
      },
      {
        accessorKey: "createdAt",
        header: () => (
          <SortHeader
            label="Created"
            active={activeSort === "createdAt"}
            direction={activeDir}
            onClick={() => pushSort("createdAt")}
          />
        ),
        cell: ({ row }) => formatDate(row.getValue("createdAt"), "—"),
      },
      {
        accessorKey: "website",
        header: "Website",
        cell: ({ row }) => {
          const val = row.getValue("website") as string | null
          if (!val) return "—"
          return (
            <a
              href={val}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {val.replace(/^https?:\/\//, "")}
            </a>
          )
        },
      },
      {
        accessorKey: "contactCount",
        header: "Contacts",
        cell: ({ row }) => row.getValue("contactCount") ?? 0,
      },
      {
        accessorKey: "opportunityCount",
        header: "Deals",
        cell: ({ row }) => row.getValue("opportunityCount") ?? 0,
      },
      {
        accessorKey: "ownerName",
        header: "Owner",
        cell: ({ row }) => row.getValue("ownerName") ?? "—",
      },
    ],
    [router, formatDate, activeSort, activeDir, pushSort],
  )

  // TanStack Table is a compatible library; this is a known false positive.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: accounts,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    getRowId: (row) => row.id,
    manualSorting: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    setIsPending(true)
    setDeleteError(null)
    try {
      const result = await bulkDeleteAction({ ids: selectedIds })
      if (result.failures.length > 0) {
        // Soft-delete is per-row, so some accounts may have deleted while others
        // failed. Refresh to drop the succeeded rows, keep the dialog open, and
        // surface which ones could not be deleted (ORR-804).
        const count = result.failures.length
        setDeleteError(
          `Could not delete ${count} account${count !== 1 ? "s" : ""}: ${result.failures[0].error}`,
        )
        router.refresh()
        return
      }
      setRowSelection({})
      setShowDeleteDialog(false)
      router.refresh()
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete accounts.",
      )
    } finally {
      setIsPending(false)
    }
  }, [selectedIds, bulkDeleteAction, router])

  const hasActiveFilters =
    urlSearch !== "" || industryFilter !== "all" || ownerFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchInput("")
    setParams(
      { q: null, industry: null, owner: null, sort: null, dir: null },
      { resetPage: true },
    )
  }, [setParams])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your accounts and companies.
          </p>
        </div>
        {generateAction ? (
          <AccountGenerator
            generateAction={generateAction}
            extractFileAction={extractFileAction}
            transcribeAction={transcribeAction}
            createAction={createAction}
            searchAccountsAction={searchAccountsAction}
            saveTaxIdsAction={saveTaxIdsAction}
            ownerOptions={ownerOptions}
            accountOptions={accountOptions}
            fieldDefinitions={fieldDefinitions}
            taxIdTypes={taxIdTypes}
            currentUserId={currentUserId}
            onSuccess={() => router.refresh()}
          />
        ) : (
          <AccountForm
            createAction={createAction}
            searchAccountsAction={searchAccountsAction}
            saveTaxIdsAction={saveTaxIdsAction}
            ownerOptions={ownerOptions}
            accountOptions={accountOptions}
            fieldDefinitions={fieldDefinitions}
            taxIdTypes={taxIdTypes}
            currentUserId={currentUserId}
            onSuccess={() => router.refresh()}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={industryFilter}
          onValueChange={(v) => setParams({ industry: v === "all" ? null : v }, { resetPage: true })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {industryOptions.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {industry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={ownerFilter}
          onValueChange={(v) => setParams({ owner: v === "all" ? null : v }, { resetPage: true })}
        >
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
            <X />
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
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

        {accounts.length > 0 ? (
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
                {table.getRowModel().rows.map((row) => (
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
                ))}
              </TableBody>
            </Table>
            <ListPagination
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              noun={{ singular: "account", plural: "accounts" }}
              onPageChange={(p) => setParams({ page: p <= 1 ? null : String(p) })}
            />
          </div>
        ) : hasActiveFilters ? (
          <Card className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Search className="size-10 text-muted-foreground" />
              <div>
                <h2 className="text-base font-medium">No matches</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  No accounts match your current filters. Try adjusting your
                  search or filter criteria.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Building2 className="size-10 text-muted-foreground" />
              <div>
                <h2 className="text-base font-medium">No accounts yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Accounts will appear here once they are created.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open)
          if (!open) setDeleteError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Accounts</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.length} account
              {selectedIds.length !== 1 ? "s" : ""}? This action cannot be
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
    </div>
  )
}
