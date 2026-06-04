"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { Users, Search } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { ContactForm } from "@/components/contacts/contact-form"
import type { AccountOption, ContactRecord, ContactStatus } from "@/lib/data/contacts"
import type { ContactCreateInput } from "@/lib/data/contacts"
import { CONTACT_STATUSES } from "@/lib/data/contacts"

interface ContactsListProps {
  accounts: AccountOption[]
  contacts: ContactRecord[]
  createAction: (input: ContactCreateInput) => Promise<ContactRecord>
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getStatusVariant(status: ContactStatus): "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" {
  switch (status) {
    case "active":
      return "default"
    case "inactive":
      return "secondary"
    case "lead":
      return "outline"
    case "customer":
      return "default"
    case "archived":
      return "destructive"
  }
}

function getStatusLabel(status: ContactStatus): string {
  switch (status) {
    case "active":
      return "Active"
    case "inactive":
      return "Inactive"
    case "lead":
      return "Lead"
    case "customer":
      return "Customer"
    case "archived":
      return "Archived"
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

function AvatarFallback({ name }: { name: string }) {
  const initials = getInitials(name)
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {initials}
    </div>
  )
}

export function ContactsList({ accounts, contacts, createAction }: ContactsListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")

  const currentStatus = searchParams.get("status") || undefined

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts
    const q = searchQuery.toLowerCase()
    return contacts.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q),
    )
  }, [contacts, searchQuery])

  const columns: ColumnDef<ContactRecord>[] = useMemo(
    () => [
      {
        accessorKey: "fullName",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <AvatarFallback name={row.getValue("fullName")} />
            <div>
              <span className="font-medium">{row.getValue("fullName")}</span>
              {row.original.title && (
                <p className="text-xs text-muted-foreground">{row.original.title}</p>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.getValue("email") ?? "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue<ContactStatus>("status")
          return (
            <Badge variant={getStatusVariant(status)}>
              {getStatusLabel(status)}
            </Badge>
          )
        },
      },
      {
        id: "lastContactDate",
        header: "Last Contact",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: filteredContacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set("status", value)
    } else {
      params.delete("status")
    }
    router.push(`/contacts?${params.toString()}`)
  }

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
          onSuccess={() => {}}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={currentStatus} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CONTACT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {getStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="flex-1">
        {filteredContacts.length > 0 ? (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
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
                  className="cursor-pointer"
                  onClick={() => router.push(`/contacts/${row.original.id}`)}
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
        ) : (
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">
                {contacts.length === 0 ? "No contacts yet" : "No matching contacts"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {contacts.length === 0
                  ? "Contacts will appear here once they are created."
                  : "Try adjusting your search or filter."}
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
