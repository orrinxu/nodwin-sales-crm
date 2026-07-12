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
  Building2,
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
import type { EntityRecord, EntityCreateInput, EntityUpdateInput } from "@/lib/data/entities"
import { usePreferences } from "@/components/providers/preferences-provider"

const currencies = [
  "USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "HKD", "JPY", "CNY",
  "KRW", "THB", "MYR", "IDR", "PHP", "VND", "AED", "SAR", "EGP", "ZAR",
]

const months = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

const emptyToNull = (v: string) => (v === "" ? null : v)

const createFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  legalName: z.string().max(300).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  baseCurrency: z.string().min(1).max(10),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  displayName: z.string().max(200).optional().or(z.literal("")),
  logoUrl: z.string().max(500).optional().or(z.literal("")),
  emailFooter: z.string().max(2000).optional().or(z.literal("")),
})

type CreateFormData = z.infer<typeof createFormSchema>

const editFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).optional(),
  legalName: z.string().max(300).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  baseCurrency: z.string().min(1).max(10).optional(),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  displayName: z.string().max(200).optional().or(z.literal("")),
  logoUrl: z.string().max(500).optional().or(z.literal("")),
  emailFooter: z.string().max(2000).optional().or(z.literal("")),
})

type EditFormData = z.infer<typeof editFormSchema>

interface EntitiesListProps {
  entities: EntityRecord[]
  createAction: (input: EntityCreateInput) => Promise<EntityRecord>
  updateAction: (id: string, input: EntityUpdateInput) => Promise<EntityRecord>
  deactivateAction: (id: string) => Promise<void>
}

function CreateEntityDialog({ createAction }: Pick<EntitiesListProps, "createAction">) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      name: "",
      legalName: "",
      country: "",
      baseCurrency: "USD",
      fiscalYearStartMonth: 1,
      displayName: "",
      logoUrl: "",
      emailFooter: "",
    },
  })

  async function onSubmit(data: CreateFormData) {
    setPending(true)
    setError(null)
    try {
      await createAction({
        name: data.name,
        legalName: emptyToNull(data.legalName ?? ""),
        country: emptyToNull(data.country ?? ""),
        baseCurrency: data.baseCurrency,
        fiscalYearStartMonth: data.fiscalYearStartMonth,
        displayName: emptyToNull(data.displayName ?? ""),
        logoUrl: emptyToNull(data.logoUrl ?? ""),
        emailFooter: emptyToNull(data.emailFooter ?? ""),
      })
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entity.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Entity
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create Entity</DialogTitle>
            <DialogDescription>
              Add a new legal entity to the organization.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="entity-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="entity-name"
                {...form.register("name")}
                placeholder="e.g. Nodwin Gaming"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="entity-legal-name">Legal Name</Label>
              <Input
                id="entity-legal-name"
                {...form.register("legalName")}
                placeholder="e.g. Nodwin Gaming International Pvt. Ltd."
              />
            </div>

            <div className="contents">
              <div className="grid gap-2">
                <Label htmlFor="entity-country">Country</Label>
                <Input
                  id="entity-country"
                  {...form.register("country")}
                  placeholder="e.g. India"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entity-currency">
                  Base Currency <span className="text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="baseCurrency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="entity-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="entity-fy-month">Fiscal Year Start Month</Label>
              <Controller
                control={form.control}
                name="fiscalYearStartMonth"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="entity-fy-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="entity-display-name">Display Name</Label>
              <Input
                id="entity-display-name"
                {...form.register("displayName")}
                placeholder="e.g. Nodwin"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="entity-logo-url">Logo URL</Label>
              <Input
                id="entity-logo-url"
                {...form.register("logoUrl")}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="entity-email-footer">Email Footer</Label>
              <Input
                id="entity-email-footer"
                {...form.register("emailFooter")}
                placeholder="Email signature / legal disclaimer"
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

function EditEntityDialog({
  entity,
  open,
  onOpenChange,
  updateAction,
}: {
  entity: EntityRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  updateAction: EntitiesListProps["updateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      name: entity.name,
      legalName: entity.legalName ?? "",
      country: entity.country ?? "",
      baseCurrency: entity.baseCurrency,
      fiscalYearStartMonth: entity.fiscalYearStartMonth,
      displayName: entity.displayName ?? "",
      logoUrl: entity.logoUrl ?? "",
      emailFooter: entity.emailFooter ?? "",
    },
  })

  async function onSubmit(data: EditFormData) {
    setPending(true)
    setError(null)
    try {
      await updateAction(entity.id, {
        name: data.name,
        legalName: emptyToNull(data.legalName ?? ""),
        country: emptyToNull(data.country ?? ""),
        baseCurrency: data.baseCurrency,
        fiscalYearStartMonth: data.fiscalYearStartMonth,
        displayName: emptyToNull(data.displayName ?? ""),
        logoUrl: emptyToNull(data.logoUrl ?? ""),
        emailFooter: emptyToNull(data.emailFooter ?? ""),
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entity.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Entity</DialogTitle>
            <DialogDescription>
              Update details for &ldquo;{entity.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-entity-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-entity-name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-entity-legal-name">Legal Name</Label>
              <Input id="edit-entity-legal-name" {...form.register("legalName")} />
            </div>

            <div className="contents">
              <div className="grid gap-2">
                <Label htmlFor="edit-entity-country">Country</Label>
                <Input id="edit-entity-country" {...form.register("country")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-entity-currency">Base Currency</Label>
                <Controller
                  control={form.control}
                  name="baseCurrency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="edit-entity-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-entity-fy-month">Fiscal Year Start Month</Label>
              <Controller
                control={form.control}
                name="fiscalYearStartMonth"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="edit-entity-fy-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-entity-display-name">Display Name</Label>
              <Input id="edit-entity-display-name" {...form.register("displayName")} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-entity-logo-url">Logo URL</Label>
              <Input id="edit-entity-logo-url" {...form.register("logoUrl")} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-entity-email-footer">Email Footer</Label>
              <Input id="edit-entity-email-footer" {...form.register("emailFooter")} />
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

function DeactivateEntityDialog({
  entity,
  open,
  onOpenChange,
  deactivateAction,
}: {
  entity: EntityRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deactivateAction: EntitiesListProps["deactivateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDeactivate() {
    if (!entity) return
    setPending(true)
    try {
      await deactivateAction(entity.id)
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
          <DialogTitle>Deactivate Entity</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate &ldquo;{entity?.name}&rdquo;?
            Inactive entities are hidden from selectors but existing data is preserved.
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

export function EntitiesList({
  entities,
  createAction,
  updateAction,
  deactivateAction,
}: EntitiesListProps) {
  const { formatDate } = usePreferences()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const [editingEntity, setEditingEntity] = useState<EntityRecord | null>(null)
  const [deactivatingEntity, setDeactivatingEntity] = useState<EntityRecord | null>(null)

  const filteredEntities = useMemo(() => {
    let result = entities

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.legalName ?? "").toLowerCase().includes(q) ||
          (e.country ?? "").toLowerCase().includes(q) ||
          (e.displayName ?? "").toLowerCase().includes(q),
      )
    }

    if (activeFilter === "active") {
      result = result.filter((e) => e.active)
    } else if (activeFilter === "inactive") {
      result = result.filter((e) => !e.active)
    }

    return result
  }, [entities, searchQuery, activeFilter])

  const columns: ColumnDef<EntityRecord>[] = useMemo(
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
        accessorKey: "legalName",
        header: "Legal Name",
        cell: ({ row }) => row.getValue("legalName") ?? "—",
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
        accessorKey: "baseCurrency",
        header: "Currency",
        cell: ({ row }) => row.getValue("baseCurrency"),
      },
      {
        accessorKey: "fiscalYearStartMonth",
        header: "FY Start",
        cell: ({ row }) => {
          const m = row.getValue<number>("fiscalYearStartMonth")
          return months.find((mo) => mo.value === m)?.label ?? m
        },
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
        cell: ({ row }) => formatDate(row.getValue("createdAt"), "—"),
      },
      {
        id: "actions",
        header: "",
        size: 80,
        cell: ({ row }) => {
          const entity = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingEntity(entity)}
                aria-label={`Edit ${entity.name}`}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeactivatingEntity(entity)}
                aria-label={`Deactivate ${entity.name}`}
              >
                <Trash2Icon className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )
        },
      },
    ],
    [formatDate],
  )

  const table = useReactTable({
    data: filteredEntities,
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
          <h1 className="text-2xl font-semibold tracking-tight">Entities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the legal entities in your organisation. Each entity owns its own users,
            business units, approval chain, and reporting currency.
          </p>
        </div>
        <CreateEntityDialog createAction={createAction} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v ?? "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            Clear
          </Button>
        )}
      </div>

      {filteredEntities.length > 0 ? (
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
                No entities match your current filters.
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
              <h2 className="text-base font-medium">No entities yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first legal entity to get started.
              </p>
            </div>
          </div>
        </Card>
      )}

      {editingEntity && (
        <EditEntityDialog
          entity={editingEntity}
          open={!!editingEntity}
          onOpenChange={(open) => { if (!open) setEditingEntity(null) }}
          updateAction={updateAction}
        />
      )}

      <DeactivateEntityDialog
        entity={deactivatingEntity}
        open={!!deactivatingEntity}
        onOpenChange={(open) => { if (!open) setDeactivatingEntity(null) }}
        deactivateAction={deactivateAction}
      />
    </div>
  )
}
