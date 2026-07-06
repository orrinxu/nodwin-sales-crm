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
import { Search, Trash2Icon, Building2, X, ArrowUpDown } from "lucide-react"

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
import { AccountForm } from "@/components/accounts/account-form"
import type { AccountListRecord, AccountCreateInput, AccountRecord } from "@/lib/data/accounts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import type { TaxIdType } from "@/lib/data/account-tax-ids"
import type { TaxIdRow } from "@/components/accounts/tax-ids-editor"
import type { EntityOption } from "@/components/entity-combobox"

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

interface AccountsListProps {
  accounts: AccountListRecord[]
  industryOptions: string[]
  ownerOptions: EntityOption[]
  accountOptions: EntityOption[]
  fieldDefinitions?: FieldDefinition[]
  taxIdTypes?: TaxIdType[]
  currentUserId?: string
  createAction: (input: AccountCreateInput) => Promise<AccountRecord>
  saveTaxIdsAction?: (accountId: string, input: { taxIds: TaxIdRow[] }) => Promise<void>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
}

export function AccountsList({
  accounts,
  industryOptions,
  ownerOptions,
  accountOptions,
  fieldDefinitions = [],
  taxIdTypes = [],
  currentUserId,
  createAction,
  saveTaxIdsAction,
  bulkDeleteAction,
}: AccountsListProps) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [ownerFilter, setOwnerFilter] = useState<string>("all")

  const filteredAccounts = useMemo(() => {
    let result = accounts

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.legalName ?? "").toLowerCase().includes(q) ||
          (a.website ?? "").toLowerCase().includes(q) ||
          (a.country ?? "").toLowerCase().includes(q),
      )
    }

    if (industryFilter !== "all") {
      result = result.filter((a) => a.industry === industryFilter)
    }

    if (ownerFilter !== "all") {
      result = result.filter((a) => a.accountOwnerUserId === ownerFilter)
    }

    return result
  }, [accounts, searchQuery, industryFilter, ownerFilter])

  // getRowId keys the selection by account id, so it survives filtering/sorting.
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
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
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
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Industry
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => row.getValue("industry") ?? "—",
      },
      {
        accessorKey: "country",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Country
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => row.getValue("country") ?? "—",
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Created
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => formatDate(row.getValue("createdAt")),
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
    [router],
  )

  // TanStack Table is a compatible library; this is a known false positive.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredAccounts,
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

  const hasActiveFilters = searchQuery || industryFilter !== "all" || ownerFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setIndustryFilter("all")
    setOwnerFilter("all")
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your accounts and companies.
          </p>
        </div>
        <AccountForm
          createAction={createAction}
          saveTaxIdsAction={saveTaxIdsAction}
          ownerOptions={ownerOptions}
          accountOptions={accountOptions}
          fieldDefinitions={fieldDefinitions}
          taxIdTypes={taxIdTypes}
          currentUserId={currentUserId}
          onSuccess={() => router.refresh()}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={industryFilter} onValueChange={(v) => setIndustryFilter(v ?? "all")}>
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

        {filteredAccounts.length > 0 ? (
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

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Accounts</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.length} account
              {selectedIds.length !== 1 ? "s" : ""}? This action cannot be
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
    </div>
  )
}
