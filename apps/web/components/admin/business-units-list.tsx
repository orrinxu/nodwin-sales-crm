"use client"

import { useCallback, useMemo, useState } from "react"
import { useForm, Controller } from "react-hook-form"
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
  Briefcase,
  X,
  ArrowUpDown,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import type { EntityRecord } from "@/lib/data/entities"
import type {
  BusinessUnitWithEntity,
  BusinessUnitCreateInput,
  BusinessUnitUpdateInput,
} from "@/lib/data/business-units"
import { businessUnitKinds } from "@/lib/shared/business-unit-kinds"
import type { BusinessUnitKind } from "@/lib/shared/business-unit-kinds"

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

function kindLabel(kind: BusinessUnitKind): string {
  return kind.replace(/_/g, " ")
}

function kindVariant(kind: BusinessUnitKind): "default" | "secondary" | "outline" | "destructive" {
  switch (kind) {
    case "sales":
      return "default"
    case "revenue_recognition":
      return "secondary"
    case "ops":
      return "outline"
    case "shared":
      return "destructive"
    default:
      return "outline"
  }
}

const createFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  entityId: z.string().optional(),
  kind: z.enum(businessUnitKinds),
})

type CreateFormData = z.infer<typeof createFormSchema>

const editFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).optional(),
  entityId: z.string().optional(),
  kind: z.enum(businessUnitKinds).optional(),
})

type EditFormData = z.infer<typeof editFormSchema>

interface BusinessUnitsListProps {
  businessUnits: BusinessUnitWithEntity[]
  entities: EntityRecord[]
  createAction: (input: BusinessUnitCreateInput) => Promise<{ id: string }>
  updateAction: (id: string, input: BusinessUnitUpdateInput) => Promise<{ id: string }>
  deactivateAction: (id: string) => Promise<void>
}

function CreateBusinessUnitDialog({
  entities,
  createAction,
}: {
  entities: EntityRecord[]
  createAction: BusinessUnitsListProps["createAction"]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      name: "",
      entityId: "",
      kind: "sales",
    },
  })

  async function onSubmit(data: CreateFormData) {
    setPending(true)
    setError(null)
    try {
      await createAction({
        name: data.name,
        entityId: data.entityId && data.entityId !== "none" ? data.entityId : null,
        kind: data.kind,
      })
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create business unit.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Business Unit
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create Business Unit</DialogTitle>
            <DialogDescription>
              Add a new business unit to your organization.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="bu-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bu-name"
                {...form.register("name")}
                placeholder="e.g. East Asia Sales"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bu-entity">Entity</Label>
              <Controller
                control={form.control}
                name="entityId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="bu-entity">
                      <SelectValue placeholder="No entity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No entity</SelectItem>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bu-kind">
                Kind <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bu-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {businessUnitKinds.map((k) => (
                        <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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

function EditBusinessUnitDialog({
  bu,
  open,
  onOpenChange,
  entities,
  updateAction,
}: {
  bu: BusinessUnitWithEntity
  open: boolean
  onOpenChange: (open: boolean) => void
  entities: EntityRecord[]
  updateAction: BusinessUnitsListProps["updateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      name: bu.name,
      entityId: bu.entityId ?? "none",
      kind: bu.kind,
    },
  })

  async function onSubmit(data: EditFormData) {
    setPending(true)
    setError(null)
    try {
      await updateAction(bu.id, {
        name: data.name,
        entityId: data.entityId && data.entityId !== "none" ? data.entityId : null,
        kind: data.kind,
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update business unit.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Business Unit</DialogTitle>
            <DialogDescription>
              Update details for &ldquo;{bu.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-bu-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-bu-name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-bu-entity">Entity</Label>
              <Controller
                control={form.control}
                name="entityId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-bu-entity">
                      <SelectValue placeholder="No entity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No entity</SelectItem>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-bu-kind">Kind</Label>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-bu-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {businessUnitKinds.map((k) => (
                        <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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

function DeactivateBusinessUnitDialog({
  bu,
  open,
  onOpenChange,
  deactivateAction,
}: {
  bu: BusinessUnitWithEntity | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deactivateAction: BusinessUnitsListProps["deactivateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDeactivate() {
    if (!bu) return
    setPending(true)
    try {
      await deactivateAction(bu.id)
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
          <DialogTitle>Deactivate Business Unit</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate &ldquo;{bu?.name}&rdquo;?
            Inactive business units are hidden from selectors but existing data is preserved.
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

export function BusinessUnitsList({
  businessUnits,
  entities,
  createAction,
  updateAction,
  deactivateAction,
}: BusinessUnitsListProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<string>("all")
  const [editingBu, setEditingBu] = useState<BusinessUnitWithEntity | null>(null)
  const [deactivatingBu, setDeactivatingBu] = useState<BusinessUnitWithEntity | null>(null)

  const filteredUnits = useMemo(() => {
    let result = businessUnits

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (bu) =>
          bu.name.toLowerCase().includes(q) ||
          (bu.entityName ?? "").toLowerCase().includes(q) ||
          (bu.parentName ?? "").toLowerCase().includes(q),
      )
    }

    if (kindFilter !== "all") {
      result = result.filter((bu) => bu.kind === kindFilter)
    }

    return result
  }, [businessUnits, searchQuery, kindFilter])

  const columns: ColumnDef<BusinessUnitWithEntity>[] = useMemo(
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
          <span className="font-medium">{row.getValue("name")}</span>
        ),
      },
      {
        accessorKey: "entityName",
        header: "Entity",
        cell: ({ row }) => row.getValue("entityName") ?? "—",
      },
      {
        accessorKey: "kind",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Kind
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const kind = row.getValue<BusinessUnitKind>("kind")
          return (
            <Badge variant={kindVariant(kind)} className="capitalize">
              {kindLabel(kind)}
            </Badge>
          )
        },
      },
      {
        accessorKey: "parentName",
        header: "Parent",
        cell: ({ row }) => row.getValue("parentName") ?? "—",
      },
      {
        accessorKey: "managerName",
        header: "Manager",
        cell: ({ row }) => row.getValue("managerName") ?? "—",
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
        id: "actions",
        header: "",
        size: 80,
        cell: ({ row }) => {
          const bu = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingBu(bu)}
                aria-label={`Edit ${bu.name}`}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeactivatingBu(bu)}
                aria-label={`Deactivate ${bu.name}`}
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
    data: filteredUnits,
    columns,
    state: { rowSelection, sorting },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const hasActiveFilters = searchQuery || kindFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setKindFilter("all")
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Business Units</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the sales and support units within each entity. Business units drive deal
            splits, team assignment, and reporting rollups.
          </p>
        </div>
        <CreateBusinessUnitDialog entities={entities} createAction={createAction} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search business units..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {businessUnitKinds.map((k) => (
              <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>
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

      {filteredUnits.length > 0 ? (
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
                No business units match your current filters.
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
            <Briefcase className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No business units yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add business units to organize your sales teams.
              </p>
            </div>
          </div>
        </Card>
      )}

      {editingBu && (
        <EditBusinessUnitDialog
          bu={editingBu}
          open={!!editingBu}
          onOpenChange={(open) => { if (!open) setEditingBu(null) }}
          entities={entities}
          updateAction={updateAction}
        />
      )}

      <DeactivateBusinessUnitDialog
        bu={deactivatingBu}
        open={!!deactivatingBu}
        onOpenChange={(open) => { if (!open) setDeactivatingBu(null) }}
        deactivateAction={deactivateAction}
      />
    </div>
  )
}
