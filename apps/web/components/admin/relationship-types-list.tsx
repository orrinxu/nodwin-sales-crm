"use client"

import { useCallback, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
  Search,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  LinkIcon,
  X,
  ArrowUpDown,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import type {
  RelationshipTypeRecord,
  RelationshipTypeCreateInput,
  RelationshipTypeUpdateInput,
} from "@/lib/data/relationship-types"

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

const createFormSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Code must start with a letter and contain only lowercase letters, numbers, and underscores",
    ),
  label: z.string().min(1, "Label is required").max(200),
  description: z.string().max(1000).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0),
})

type CreateFormData = z.infer<typeof createFormSchema>

const editFormSchema = z.object({
  label: z.string().min(1, "Label is required").max(200).optional(),
  description: z.string().max(1000).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).optional(),
})

type EditFormData = z.infer<typeof editFormSchema>

interface RelationshipTypesListProps {
  relationshipTypes: RelationshipTypeRecord[]
  createAction: (input: RelationshipTypeCreateInput) => Promise<RelationshipTypeRecord>
  updateAction: (code: string, input: RelationshipTypeUpdateInput) => Promise<RelationshipTypeRecord>
  deactivateAction: (code: string) => Promise<void>
}

function CreateRelationshipTypeDialog({
  createAction,
}: {
  createAction: RelationshipTypesListProps["createAction"]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      code: "",
      label: "",
      description: "",
      sortOrder: 0,
    },
  })

  async function onSubmit(data: CreateFormData) {
    setPending(true)
    setError(null)
    try {
      await createAction({
        code: data.code,
        label: data.label,
        description: data.description || null,
        sortOrder: data.sortOrder,
      })
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create relationship type.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Type
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create Relationship Type</DialogTitle>
            <DialogDescription>
              Define a new relationship type between accounts.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rt-code">
                Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rt-code"
                {...form.register("code")}
                placeholder="e.g. partner"
              />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rt-label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rt-label"
                {...form.register("label")}
                placeholder="e.g. Partner"
              />
              {form.formState.errors.label && (
                <p className="text-xs text-destructive">{form.formState.errors.label.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rt-description">Description</Label>
              <Input
                id="rt-description"
                {...form.register("description")}
                placeholder="Brief description of this relationship type"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rt-sort-order">Sort Order</Label>
              <Input
                id="rt-sort-order"
                type="number"
                min={0}
                {...form.register("sortOrder")}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditRelationshipTypeDialog({
  rt,
  open,
  onOpenChange,
  updateAction,
}: {
  rt: RelationshipTypeRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  updateAction: RelationshipTypesListProps["updateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      label: rt.label,
      description: rt.description ?? "",
      sortOrder: rt.sortOrder,
    },
  })

  async function onSubmit(data: EditFormData) {
    setPending(true)
    setError(null)
    try {
      await updateAction(rt.code, {
        label: data.label,
        description: data.description || null,
        sortOrder: data.sortOrder,
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update relationship type.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Relationship Type</DialogTitle>
            <DialogDescription>
              Update details for &ldquo;{rt.label}&rdquo;.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Code</Label>
              <p className="text-sm text-muted-foreground rounded-md bg-muted px-3 py-2 font-mono">
                {rt.code}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-rt-label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-rt-label" {...form.register("label")} />
              {form.formState.errors.label && (
                <p className="text-xs text-destructive">{form.formState.errors.label.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-rt-description">Description</Label>
              <Input id="edit-rt-description" {...form.register("description")} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-rt-sort-order">Sort Order</Label>
              <Input
                id="edit-rt-sort-order"
                type="number"
                min={0}
                {...form.register("sortOrder")}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeactivateRelationshipTypeDialog({
  rt,
  open,
  onOpenChange,
  deactivateAction,
}: {
  rt: RelationshipTypeRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deactivateAction: RelationshipTypesListProps["deactivateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDeactivate() {
    if (!rt) return
    setPending(true)
    try {
      await deactivateAction(rt.code)
      onOpenChange(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate Relationship Type</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate &ldquo;{rt?.label}&rdquo;?
            Inactive relationship types cannot be used for new account
            relationships, but existing relationships are preserved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeactivate} disabled={pending}>
            {pending ? "Deactivating..." : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RelationshipTypesList({
  relationshipTypes,
  createAction,
  updateAction,
  deactivateAction,
}: RelationshipTypesListProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const [editingRt, setEditingRt] = useState<RelationshipTypeRecord | null>(null)
  const [deactivatingRt, setDeactivatingRt] = useState<RelationshipTypeRecord | null>(null)

  const filteredTypes = useMemo(() => {
    let result = relationshipTypes

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (rt) =>
          rt.code.toLowerCase().includes(q) ||
          rt.label.toLowerCase().includes(q) ||
          (rt.description ?? "").toLowerCase().includes(q),
      )
    }

    if (activeFilter === "active") {
      result = result.filter((rt) => rt.active)
    } else if (activeFilter === "inactive") {
      result = result.filter((rt) => !rt.active)
    }

    return result
  }, [relationshipTypes, searchQuery, activeFilter])

  const columns: ColumnDef<RelationshipTypeRecord>[] = useMemo(
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
        accessorKey: "code",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Code
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {row.getValue("code")}
          </code>
        ),
      },
      {
        accessorKey: "label",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Label
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("label")}</span>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => row.getValue("description") ?? "—",
      },
      {
        accessorKey: "sortOrder",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Sort Order
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => row.getValue("sortOrder"),
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row }) =>
          row.getValue<boolean>("active") ? (
            <Badge variant="default">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          ),
      },
      {
        id: "actions",
        header: "",
        size: 80,
        cell: ({ row }) => {
          const rt = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingRt(rt)}
                aria-label={`Edit ${rt.label}`}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeactivatingRt(rt)}
                aria-label={`Deactivate ${rt.label}`}
              >
                <Trash2Icon className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )
        },
      },
    ],
    [],
  )

  const table = useReactTable({
    data: filteredTypes,
    columns,
    state: { rowSelection, sorting },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const hasActiveFilters = searchQuery || activeFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setActiveFilter("all")
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relationship Types</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage relationship types used between accounts.
          </p>
        </div>
        <CreateRelationshipTypeDialog createAction={createAction} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search relationship types..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            Clear
          </Button>
        )}
      </div>

      {filteredTypes.length > 0 ? (
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
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
      ) : hasActiveFilters ? (
        <Card className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Search className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No matches</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                No relationship types match your current filters.
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
            <LinkIcon className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No relationship types yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Define relationship types to categorize account connections.
              </p>
            </div>
          </div>
        </Card>
      )}

      {editingRt && (
        <EditRelationshipTypeDialog
          rt={editingRt}
          open={!!editingRt}
          onOpenChange={(open) => { if (!open) setEditingRt(null) }}
          updateAction={updateAction}
        />
      )}

      <DeactivateRelationshipTypeDialog
        rt={deactivatingRt}
        open={!!deactivatingRt}
        onOpenChange={(open) => { if (!open) setDeactivatingRt(null) }}
        deactivateAction={deactivateAction}
      />
    </div>
  )
}
