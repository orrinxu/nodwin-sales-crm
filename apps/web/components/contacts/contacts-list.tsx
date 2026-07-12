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
import { Search, Trash2Icon, Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OwnerLink } from "@/components/people/owner-link"
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
import { ContactForm } from "@/components/contacts/contact-form"
import type { AccountOption, ContactListRecord, ContactCreateInput, ContactRecord } from "@/lib/data/contacts"
import { usePreferences } from "@/components/providers/preferences-provider"

interface ContactsListProps {
  contacts: ContactListRecord[]
  accounts: AccountOption[]
  createAction: (input: ContactCreateInput) => Promise<ContactRecord>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
}

export function ContactsList({
  contacts,
  accounts,
  createAction,
  bulkDeleteAction,
}: ContactsListProps) {
  const router = useRouter()
  const { formatDate } = usePreferences()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [accountFilter, setAccountFilter] = useState<string>("all")

  const ownerOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const c of contacts) {
      if (c.ownerUserId && c.ownerName) {
        names.set(c.ownerUserId, c.ownerName)
      }
    }
    return Array.from(names.entries()).map(([id, name]) => ({ id, name }))
  }, [contacts])

  const [ownerFilter, setOwnerFilter] = useState<string>("all")

  const filteredContacts = useMemo(() => {
    let result = contacts

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.title ?? "").toLowerCase().includes(q),
      )
    }

    if (accountFilter !== "all") {
      result = result.filter((c) => c.primaryAccountId === accountFilter)
    }

    if (ownerFilter !== "all") {
      result = result.filter((c) => c.ownerUserId === ownerFilter)
    }

    return result
  }, [contacts, searchQuery, accountFilter, ownerFilter])

  // getRowId keys the selection by contact id, so it survives filtering/sorting.
  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, isSelected]) => isSelected)
        .map(([id]) => id),
    [rowSelection],
  )

  const columns: ColumnDef<ContactListRecord>[] = useMemo(
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
        accessorKey: "fullName",
        header: "Name",
        cell: ({ row }) => (
          <button
            className="font-medium hover:underline"
            onClick={() => router.push(`/contacts/${row.original.id}`)}
          >
            {row.getValue("fullName")}
          </button>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => row.getValue("email") ?? "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.getValue("phone") ?? "—",
      },
      {
        accessorKey: "primaryAccountName",
        header: "Account",
        cell: ({ row }) => row.getValue("primaryAccountName") ?? "—",
      },
      {
        accessorKey: "ownerName",
        header: "Owner",
        cell: ({ row }) => (
          <OwnerLink
            userId={row.original.ownerUserId}
            name={row.original.ownerName}
            fallback="—"
          />
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDate(row.getValue("createdAt"), "—"),
      },
    ],
    [router, formatDate],
  )

  // TanStack Table is a compatible library; this is a known false positive.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredContacts,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    getRowId: (row) => row.id,
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

  const hasActiveFilters = searchQuery || accountFilter !== "all" || ownerFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setAccountFilter("all")
    setOwnerFilter("all")
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your contacts and address book.
          </p>
        </div>
        <ContactForm
          accounts={accounts}
          createAction={createAction}
          onSuccess={() => router.refresh()}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={accountFilter} onValueChange={(v) => setAccountFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ownerOptions.length > 0 && (
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
        )}
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

        {filteredContacts.length > 0 ? (
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
                  No contacts match your current filters. Try adjusting your
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
              <Users className="size-10 text-muted-foreground" />
              <div>
                <h2 className="text-base font-medium">No contacts yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Contacts will appear here once they are created.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contacts</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.length} contact
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
