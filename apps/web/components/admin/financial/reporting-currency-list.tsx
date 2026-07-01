"use client"

import { useMemo, useState } from "react"
import { PlusIcon, ArrowUpDown, Trash2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type {
  ReportingCurrencyRecord,
  ReportingCurrencyCreateInput,
} from "@/lib/data/reporting-currency"
import type { EntityRecord } from "@/lib/data/entities"

interface ReportingCurrencyListProps {
  settings: ReportingCurrencyRecord[]
  entities: EntityRecord[]
  currencies: string[]
  createAction: (input: ReportingCurrencyCreateInput) => Promise<ReportingCurrencyRecord>
  deleteAction: (id: string) => Promise<void>
}

function CreateReportingCurrencyDialog({
  entities,
  currencies,
  createAction,
}: Pick<ReportingCurrencyListProps, "entities" | "currencies" | "createAction">) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entityId, setEntityId] = useState<string>("global")
  const [currencyCode, setCurrencyCode] = useState<string>(currencies[0] ?? "USD")
  const [isDefault, setIsDefault] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await createAction({
        entityId: entityId === "global" ? null : entityId,
        currencyCode,
        isDefault,
      })
      setOpen(false)
      setEntityId("global")
      setCurrencyCode(currencies[0] ?? "USD")
      setIsDefault(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reporting currency.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        Add Setting
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Reporting Currency</DialogTitle>
            <DialogDescription>
              Set a global default or per-entity reporting currency override.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rc-entity">Entity</Label>
              <Select value={entityId} onValueChange={(v) => setEntityId(v ?? "global")}>
                <SelectTrigger id="rc-entity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global Default</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rc-currency">Currency</Label>
              <Select value={currencyCode} onValueChange={(v) => setCurrencyCode(v ?? (currencies[0] ?? "USD"))}>
                <SelectTrigger id="rc-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="rc-default"
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 rounded border-border"
              />
              <Label htmlFor="rc-default">Set as global default</Label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add Setting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ReportingCurrencyList({
  settings,
  entities,
  currencies,
  createAction,
  deleteAction,
}: ReportingCurrencyListProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const columns: ColumnDef<ReportingCurrencyRecord>[] = useMemo(
    () => [
      {
        accessorKey: "entityName",
        header: "Entity",
        cell: ({ row }) => {
          const name = row.getValue<string>("entityName")
          return name ? <span>{name}</span> : <Badge variant="secondary">Global</Badge>
        },
      },
      {
        accessorKey: "currencyCode",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Currency
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.getValue("currencyCode")}</span>
        ),
      },
      {
        accessorKey: "isDefault",
        header: "Default",
        cell: ({ row }) =>
          row.getValue<boolean>("isDefault") ? (
            <Badge variant="default">Default</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        size: 60,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  setDeletingId(record.id)
                  try {
                    await deleteAction(record.id)
                    router.refresh()
                  } catch {
                    // error handled by action
                  } finally {
                    setDeletingId(null)
                  }
                }}
                disabled={deletingId === record.id}
                aria-label={`Delete ${record.currencyCode}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )
        },
      },
    ],
    [deleteAction, router, deletingId],
  )

  const table = useReactTable({
    data: settings,
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
          <h1 className="text-2xl font-semibold tracking-tight">Reporting Currency</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Global default and per-entity reporting currency overrides.
          </p>
        </div>
        <CreateReportingCurrencyDialog
          entities={entities}
          currencies={currencies}
          createAction={createAction}
        />
      </div>

      {settings.length > 0 ? (
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
            <div className="text-2xl text-muted-foreground">$</div>
            <div>
              <h2 className="text-base font-medium">No reporting currencies</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a global default or per-entity override.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
