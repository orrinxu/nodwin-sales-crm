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
  Package,
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
  ProductRecord,
  ProductCreateInput,
  ProductUpdateInput,
} from "@/lib/data/products"

const priceField = z
  .string()
  .max(30)
  .regex(/^\d*\.?\d*$/, "Enter a number, e.g. 5000 or 199.99")
  .optional()
  .or(z.literal(""))

const createFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().max(64).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  unitPriceAmount: priceField,
  unitCostAmount: priceField,
  unitPriceCurrency: z.string().max(10).optional().or(z.literal("")),
  displayOrder: z.coerce.number().int().min(0),
})

type CreateFormData = z.infer<typeof createFormSchema>

const editFormSchema = createFormSchema

type EditFormData = z.infer<typeof editFormSchema>

interface ProductsListProps {
  products: ProductRecord[]
  createAction: (input: ProductCreateInput) => Promise<ProductRecord>
  updateAction: (id: string, input: ProductUpdateInput) => Promise<ProductRecord>
  deactivateAction: (id: string) => Promise<void>
}

function ProductFields({
  form,
}: {
  form: ReturnType<typeof useForm<CreateFormData>>
}) {
  return (
    <div className="grid gap-4 py-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="prod-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input id="prod-name" {...form.register("name")} placeholder="e.g. Homepage Banner" />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="prod-sku">SKU</Label>
        <Input id="prod-sku" {...form.register("sku")} placeholder="e.g. BANNER-01" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="prod-order">Sort Order</Label>
        <Input id="prod-order" type="number" min={0} {...form.register("displayOrder")} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="prod-price">Unit Price</Label>
        <Input id="prod-price" inputMode="decimal" {...form.register("unitPriceAmount")} placeholder="0" />
        {form.formState.errors.unitPriceAmount && (
          <p className="text-xs text-destructive">{form.formState.errors.unitPriceAmount.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="prod-cost">Unit Cost</Label>
        <Input id="prod-cost" inputMode="decimal" {...form.register("unitCostAmount")} placeholder="0" />
        {form.formState.errors.unitCostAmount && (
          <p className="text-xs text-destructive">{form.formState.errors.unitCostAmount.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="prod-currency">Currency</Label>
        <Input id="prod-currency" {...form.register("unitPriceCurrency")} placeholder="USD" />
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="prod-description">Description</Label>
        <Input id="prod-description" {...form.register("description")} placeholder="Optional description" />
      </div>
    </div>
  )
}

function CreateProductDialog({
  createAction,
}: {
  createAction: ProductsListProps["createAction"]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      name: "",
      sku: "",
      description: "",
      unitPriceAmount: "",
      unitCostAmount: "",
      unitPriceCurrency: "USD",
      displayOrder: 0,
    },
  })

  async function onSubmit(data: CreateFormData) {
    setPending(true)
    setError(null)
    try {
      await createAction({
        name: data.name,
        sku: data.sku || null,
        description: data.description || null,
        unitPriceAmount: data.unitPriceAmount || "0",
        unitCostAmount: data.unitCostAmount || "0",
        unitPriceCurrency: data.unitPriceCurrency || "USD",
        displayOrder: data.displayOrder,
      })
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Product
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create Product</DialogTitle>
            <DialogDescription>
              Add a sellable product or service to the catalog.
            </DialogDescription>
          </DialogHeader>
          <ProductFields form={form} />
          {error && <p className="text-sm text-destructive">{error}</p>}
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

function EditProductDialog({
  product,
  open,
  onOpenChange,
  updateAction,
}: {
  product: ProductRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  updateAction: ProductsListProps["updateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      name: product.name,
      sku: product.sku ?? "",
      description: product.description ?? "",
      unitPriceAmount: product.unitPriceAmount,
      unitCostAmount: product.unitCostAmount,
      unitPriceCurrency: product.unitPriceCurrency,
      displayOrder: product.displayOrder,
    },
  })

  async function onSubmit(data: EditFormData) {
    setPending(true)
    setError(null)
    try {
      await updateAction(product.id, {
        name: data.name,
        sku: data.sku || null,
        description: data.description || null,
        unitPriceAmount: data.unitPriceAmount || "0",
        unitCostAmount: data.unitCostAmount || "0",
        unitPriceCurrency: data.unitPriceCurrency || "USD",
        displayOrder: data.displayOrder,
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update details for &ldquo;{product.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <ProductFields form={form} />
          {error && <p className="text-sm text-destructive">{error}</p>}
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

function DeactivateProductDialog({
  product,
  open,
  onOpenChange,
  deactivateAction,
}: {
  product: ProductRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deactivateAction: ProductsListProps["deactivateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDeactivate() {
    if (!product) return
    setPending(true)
    try {
      await deactivateAction(product.id)
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
          <DialogTitle>Deactivate Product</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate &ldquo;{product?.name}&rdquo;?
            Inactive products can&rsquo;t be added to new deal line items, but
            existing line items are preserved.
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

export function ProductsList({
  products,
  createAction,
  updateAction,
  deactivateAction,
}: ProductsListProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const [editing, setEditing] = useState<ProductRecord | null>(null)
  const [deactivating, setDeactivating] = useState<ProductRecord | null>(null)

  const filtered = useMemo(() => {
    let result = products
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q),
      )
    }
    if (activeFilter === "active") result = result.filter((p) => p.active)
    else if (activeFilter === "inactive") result = result.filter((p) => !p.active)
    return result
  }, [products, searchQuery, activeFilter])

  const columns: ColumnDef<ProductRecord>[] = useMemo(
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
        cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
      },
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) =>
          row.getValue("sku") ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              {row.getValue("sku")}
            </code>
          ) : (
            "—"
          ),
      },
      {
        id: "unitPrice",
        header: "Unit Price",
        cell: ({ row }) => {
          const p = row.original
          return (
            <span className="tabular-nums">
              {p.unitPriceCurrency} {p.unitPriceAmount}
            </span>
          )
        },
      },
      {
        accessorKey: "displayOrder",
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
        cell: ({ row }) => row.getValue("displayOrder"),
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
          const p = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(p)}
                aria-label={`Edit ${p.name}`}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeactivating(p)}
                aria-label={`Deactivate ${p.name}`}
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
    data: filtered,
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
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the catalog of sellable products and services. These become the
            line items reps add to deals.
          </p>
        </div>
        <CreateProductDialog createAction={createAction} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
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

      {filtered.length > 0 ? (
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
                No products match your current filters.
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
            <Package className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No products yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add products to build your catalog.
              </p>
            </div>
          </div>
        </Card>
      )}

      {editing && (
        <EditProductDialog
          product={editing}
          open={!!editing}
          onOpenChange={(open) => { if (!open) setEditing(null) }}
          updateAction={updateAction}
        />
      )}

      <DeactivateProductDialog
        product={deactivating}
        open={!!deactivating}
        onOpenChange={(open) => { if (!open) setDeactivating(null) }}
        deactivateAction={deactivateAction}
      />
    </div>
  )
}
