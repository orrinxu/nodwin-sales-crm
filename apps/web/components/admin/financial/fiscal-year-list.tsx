"use client"

import { useMemo, useState } from "react"
import { PlusIcon, ArrowUpDown, PencilIcon } from "lucide-react"
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
  FiscalYearRecord,
  FiscalYearCreateInput,
} from "@/lib/data/fiscal-year"
import type { EntityRecord } from "@/lib/data/entities"

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

function getCurrentFyPeriod(fyStartMonth: number): string {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const fyStartYear = currentMonth >= fyStartMonth ? currentYear : currentYear - 1
  const fyEndYear = fyStartYear + 1
  return `${monthNames[fyStartMonth - 1]} ${fyStartYear} – ${monthNames[fyStartMonth - 1]} ${fyEndYear}`
}

interface FiscalYearListProps {
  settings: FiscalYearRecord[]
  entities: EntityRecord[]
  upsertAction: (input: FiscalYearCreateInput) => Promise<FiscalYearRecord>
}

function UpsertFiscalYearDialog({
  entities,
  settings,
  upsertAction,
  existing,
}: {
  entities: EntityRecord[]
  settings: FiscalYearRecord[]
  upsertAction: (input: FiscalYearCreateInput) => Promise<FiscalYearRecord>
  existing?: FiscalYearRecord
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entityId, setEntityId] = useState<string>(existing?.entityId ?? entities[0]?.id ?? "")
  const [fyStartMonth, setFyStartMonth] = useState<string>(
    String(existing?.fyStartMonth ?? 1),
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await upsertAction({
        entityId,
        fyStartMonth: Number(fyStartMonth),
      })
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fiscal year setting.")
    } finally {
      setPending(false)
    }
  }

  const availableEntities = existing
    ? entities.filter((e) => e.id === existing.entityId)
    : entities.filter((e) => !settings.some((s: FiscalYearRecord) => s.entityId === e.id))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {existing ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Edit ${existing.entityName}`}>
          <PencilIcon className="h-4 w-4" />
        </Button>
      ) : (
        <DialogTrigger render={<Button variant="default" size="sm" />}>
          <PlusIcon className="h-4 w-4" />
          Add Setting
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{existing ? "Edit" : "Add"} Fiscal Year Setting</DialogTitle>
            <DialogDescription>
              Choose the fiscal year start month for an entity.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fy-entity">Entity</Label>
              <Select
                value={entityId}
                onValueChange={(v) => setEntityId(v ?? "")}
                disabled={!!existing}
              >
                <SelectTrigger id="fy-entity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableEntities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fy-month">Fiscal Year Start Month</Label>
              <Select value={fyStartMonth} onValueChange={(v) => setFyStartMonth(v ?? "1")}>
                <SelectTrigger id="fy-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((name, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : existing ? "Save" : "Add Setting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function FiscalYearList({ settings, entities, upsertAction }: FiscalYearListProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<FiscalYearRecord>[] = useMemo(
    () => [
      {
        accessorKey: "entityName",
        header: "Entity",
        cell: ({ row }) => <span className="font-medium">{row.getValue("entityName")}</span>,
      },
      {
        accessorKey: "fyStartMonth",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            FY Start Month
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const month = row.getValue<number>("fyStartMonth")
          return <span>{monthNames[month - 1]}</span>
        },
      },
      {
        id: "currentFy",
        header: "Current FY Period",
        cell: ({ row }) => {
          const month = row.original.fyStartMonth
          return (
            <Badge variant="outline" className="font-mono text-xs">
              {getCurrentFyPeriod(month)}
            </Badge>
          )
        },
      },
      {
        id: "actions",
        header: "",
        size: 60,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <UpsertFiscalYearDialog
                entities={entities}
                settings={settings}
                upsertAction={upsertAction}
                existing={record}
              />
            </div>
          )
        },
      },
    ],
    [entities, settings, upsertAction],
  )

  const table = useReactTable({
    data: settings,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const unconfiguredEntities = entities.filter((e) => !settings.some((s) => s.entityId === e.id))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fiscal Year</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure fiscal year start months per entity. Defaults to January if not set.
          </p>
        </div>
        {unconfiguredEntities.length > 0 && (
              <UpsertFiscalYearDialog entities={entities} settings={settings} upsertAction={upsertAction} />
        )}
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
            <div className="text-2xl text-muted-foreground">📅</div>
            <div>
              <h2 className="text-base font-medium">No fiscal year settings</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                All entities default to January. Add a setting to customize.
              </p>
            </div>
            {unconfiguredEntities.length > 0 && (
          <UpsertFiscalYearDialog entities={entities} settings={settings} upsertAction={upsertAction} />
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
