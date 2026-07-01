"use client"

import { useCallback, useMemo, useState } from "react"
import { Search, X, PencilIcon, ArrowUpDown } from "lucide-react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CurrencyRecord, CurrencyUpdateInput } from "@/lib/data/currencies"

const specialScales: Record<string, string> = {
  USDT: "Stablecoin (scale 4)",
  JPY: "Zero-decimal",
  KRW: "Zero-decimal",
  VND: "Zero-decimal",
}

const scaleOptions = [
  { value: 0, label: "0 (zero-decimal)" },
  { value: 1, label: "1" },
  { value: 2, label: "2 (standard)" },
  { value: 3, label: "3" },
  { value: 4, label: "4 (USDT)" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 8, label: "8 (crypto)" },
]

interface CurrenciesListProps {
  currencies: CurrencyRecord[]
  updateAction: (code: string, input: CurrencyUpdateInput) => Promise<CurrencyRecord>
}

function EditCurrencyDialog({
  currency,
  open,
  onOpenChange,
  updateAction,
}: {
  currency: CurrencyRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  updateAction: CurrenciesListProps["updateAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(String(currency.scale))
  const [active, setActive] = useState(currency.active)

  async function handleSave() {
    setPending(true)
    setError(null)
    try {
      await updateAction(currency.code, {
        scale: Number(scale),
        active,
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update currency.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {currency.code}</DialogTitle>
          <DialogDescription>
            {currency.name}
            {specialScales[currency.code] && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({specialScales[currency.code]})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-scale">Decimal Scale</Label>
            <Select value={scale} onValueChange={(v) => setScale(v ?? "2")}>
              <SelectTrigger id="edit-scale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scaleOptions.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="edit-active" checked={active} onCheckedChange={(checked) => setActive(!!checked)} />
            <Label htmlFor="edit-active">Active</Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CurrenciesList({ currencies, updateAction }: CurrenciesListProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [editingCurrency, setEditingCurrency] = useState<CurrencyRecord | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filteredCurrencies = useMemo(() => {
    let result = currencies
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q),
      )
    }
    if (statusFilter === "active") {
      result = result.filter((c) => c.active)
    } else if (statusFilter === "inactive") {
      result = result.filter((c) => !c.active)
    }
    return result
  }, [currencies, searchQuery, statusFilter])

  const columns: ColumnDef<CurrencyRecord>[] = useMemo(
    () => [
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
          <span className="font-mono font-medium">{row.getValue("code")}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span>
            {row.getValue("name")}
            {specialScales[row.original.code] && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({specialScales[row.original.code]})
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "scale",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Scale
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono">{row.getValue<number>("scale")}</span>
        ),
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
        size: 60,
        cell: ({ row }) => {
          const currency = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingCurrency(currency)}
                aria-label={`Edit ${currency.code}`}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
            </div>
          )
        },
      },
    ],
    [],
  )

  const table = useReactTable({
    data: filteredCurrencies,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const hasActiveFilters = searchQuery || statusFilter !== "all"

  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setStatusFilter("all")
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Currencies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage currency registry — codes, decimal scales, and active flags.
          JPY, KRW, and VND use scale 0 (zero-decimal). USDT uses scale 4.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search currencies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
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

      {filteredCurrencies.length > 0 ? (
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
                <TableRow key={row.id}>
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
                No currencies match your current filters.
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
            <DollarSign className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No currencies</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The currency registry is empty.
              </p>
            </div>
          </div>
        </Card>
      )}

      {editingCurrency && (
        <EditCurrencyDialog
          currency={editingCurrency}
          open={!!editingCurrency}
          onOpenChange={(open) => { if (!open) setEditingCurrency(null) }}
          updateAction={updateAction}
        />
      )}
    </div>
  )
}

function DollarSign(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}
