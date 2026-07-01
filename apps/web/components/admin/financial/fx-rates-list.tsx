"use client"

import { useMemo, useState } from "react"
import { PlusIcon, ArrowUpDown, Clock } from "lucide-react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FxRateRecord, FxRateCreateInput } from "@/lib/data/fx-rates"

function formatDate(dateStr: string): string {
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

function isStale(effectiveDate: string): boolean {
  return new Date(effectiveDate) < new Date(Date.now() - 7 * 86400000)
}

const currencyCodes = [
  "AED", "ARS", "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EGP",
  "EUR", "GBP", "HKD", "IDR", "ILS", "INR", "JPY", "KRW", "MXN", "MYR",
  "NGN", "NOK", "NZD", "PHP", "PKR", "PLN", "QAR", "RON", "RUB", "SAR",
  "SEK", "SGD", "THB", "TRY", "TWD", "USD", "USDT", "VND", "ZAR",
]

interface FxRatesListProps {
  rates: FxRateRecord[]
  createAction: (input: FxRateCreateInput) => Promise<FxRateRecord>
}

function CreateFxRateDialog({ createAction }: Pick<FxRatesListProps, "createAction">) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromCurrency, setFromCurrency] = useState("USD")
  const [toCurrency, setToCurrency] = useState("EUR")
  const [rate, setRate] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const rateNum = parseFloat(rate)
      if (isNaN(rateNum) || rateNum <= 0) {
        throw new Error("Rate must be a positive number.")
      }
      if (fromCurrency === toCurrency) {
        throw new Error("From and To currencies must be different.")
      }
      await createAction({
        fromCurrency,
        toCurrency,
        rate: rateNum,
        effectiveDate,
        source: "manual",
      })
      setFromCurrency("USD")
      setToCurrency("EUR")
      setRate("")
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create FX rate.")
    } finally {
      setPending(false)
    }
  }

  const currencies = currencyCodes.filter((c) => c !== fromCurrency)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Rate
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add FX Rate</DialogTitle>
            <DialogDescription>
              Enter a new exchange rate for a currency pair.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="fx-from">From Currency</Label>
                <Select value={fromCurrency} onValueChange={(v) => setFromCurrency(v ?? "USD")}>
                  <SelectTrigger id="fx-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyCodes.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fx-to">To Currency</Label>
                <Select value={toCurrency} onValueChange={(v) => setToCurrency(v ?? "EUR")}>
                  <SelectTrigger id="fx-to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fx-rate">
                Rate <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fx-rate"
                type="number"
                step="0.00000001"
                min="0.00000001"
                placeholder="e.g. 0.92"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                How many units of To currency equal 1 unit of From currency.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fx-date">Effective Date</Label>
              <Input
                id="fx-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add Rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function FxRatesList({ rates, createAction }: FxRatesListProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<FxRateRecord>[] = useMemo(
    () => [
      {
        accessorKey: "fromCurrency",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            From
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue("fromCurrency")}</span>
        ),
      },
      {
        accessorKey: "toCurrency",
        header: "To",
        cell: ({ row }) => (
          <span className="font-mono">{row.getValue("toCurrency")}</span>
        ),
      },
      {
        accessorKey: "rate",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Rate
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {Number(row.getValue<number>("rate")).toFixed(8)}
          </span>
        ),
      },
      {
        accessorKey: "effectiveDate",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Effective
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const date = row.getValue<string>("effectiveDate")
          const stale = isStale(date)
          return (
            <div className="flex items-center gap-2">
              <span>{formatDate(date)}</span>
              {stale && (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <Clock className="mr-1 size-3" />
                  Stale
                </Badge>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => (
          <Badge variant="secondary" className="capitalize">
            {row.getValue("source")}
          </Badge>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: rates,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">FX Rates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Exchange rates for multi-currency conversion. Rates older than 7 days are marked stale.
          </p>
        </div>
        <CreateFxRateDialog createAction={createAction} />
      </div>

      {rates.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
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
      ) : (
        <Card className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Clock className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No FX rates yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first exchange rate to enable currency conversion.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
