"use client"

import { useMemo, useState } from "react"
import { PlusIcon, ArrowUpDown, PencilIcon, Trash2 } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  ApprovalThresholdRecord,
  ApprovalThresholdCreateInput,
} from "@/lib/data/approval-thresholds"
import type { EntityRecord } from "@/lib/data/entities"

interface ApprovalThresholdsListProps {
  thresholds: ApprovalThresholdRecord[]
  entities: EntityRecord[]
  upsertAction: (input: ApprovalThresholdCreateInput) => Promise<ApprovalThresholdRecord>
  deleteAction: (id: string) => Promise<void>
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function UpsertThresholdDialog({
  entities,
  thresholds,
  upsertAction,
  existing,
}: {
  entities: EntityRecord[]
  thresholds: ApprovalThresholdRecord[]
  upsertAction: (input: ApprovalThresholdCreateInput) => Promise<ApprovalThresholdRecord>
  existing?: ApprovalThresholdRecord
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entityId, setEntityId] = useState<string>(existing?.entityId ?? "")
  const [dealValueThreshold, setDealValueThreshold] = useState<string>(
    existing?.dealValueThreshold?.toString() ?? "",
  )
  const [discountThresholdPct, setDiscountThresholdPct] = useState<string>(
    existing?.discountThresholdPct?.toString() ?? "",
  )
  const [confidentialTierRequired, setConfidentialTierRequired] = useState<string>(
    existing?.confidentialTierRequired ?? "",
  )
  const [approverRole, setApproverRole] = useState<string>(existing?.approverRole ?? "admin")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const dvt = dealValueThreshold.trim() === "" ? null : parseFloat(dealValueThreshold)
      const dtp = discountThresholdPct.trim() === "" ? null : parseFloat(discountThresholdPct)
      if (dvt !== null && (isNaN(dvt) || dvt <= 0)) {
        throw new Error("Deal value threshold must be a positive number.")
      }
      if (dtp !== null && (isNaN(dtp) || dtp < 0 || dtp > 100)) {
        throw new Error("Discount threshold must be between 0 and 100.")
      }

      await upsertAction({
        entityId,
        dealValueThreshold: dvt,
        discountThresholdPct: dtp,
        confidentialTierRequired: confidentialTierRequired.trim() || null,
        approverRole,
      })
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save approval threshold.")
    } finally {
      setPending(false)
    }
  }

  const availableEntities = existing
    ? entities.filter((e) => e.id === existing.entityId)
      : entities.filter((e) => !thresholds.some((t: ApprovalThresholdRecord) => t.entityId === e.id))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {existing ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Edit ${existing.entityName}`}>
          <PencilIcon className="h-4 w-4" />
        </Button>
      ) : (
        <DialogTrigger render={<Button variant="default" size="sm" />}>
          <PlusIcon className="h-4 w-4" />
          Add Threshold
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{existing ? "Edit" : "Add"} Approval Threshold</DialogTitle>
            <DialogDescription>
              Define deal value, discount, and confidentiality rules for an entity.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="at-entity">Entity</Label>
              <Select value={entityId} onValueChange={(v) => setEntityId(v ?? "")} disabled={!!existing}>
                <SelectTrigger id="at-entity">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="at-deal-value">Deal Value Threshold</Label>
                <Input
                  id="at-deal-value"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 50000"
                  value={dealValueThreshold}
                  onChange={(e) => setDealValueThreshold(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="at-discount">Discount Threshold (%)</Label>
                <Input
                  id="at-discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="e.g. 15"
                  value={discountThresholdPct}
                  onChange={(e) => setDiscountThresholdPct(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="at-tier">Confidential Tier Required</Label>
                <Input
                  id="at-tier"
                  placeholder="e.g. executive"
                  value={confidentialTierRequired}
                  onChange={(e) => setConfidentialTierRequired(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="at-role">Approver Role</Label>
                <Select value={approverRole} onValueChange={(v) => setApproverRole(v ?? "admin")}>
                  <SelectTrigger id="at-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : existing ? "Save" : "Add Threshold"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ApprovalThresholdsList({
  thresholds,
  entities,
  upsertAction,
  deleteAction,
}: ApprovalThresholdsListProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const columns: ColumnDef<ApprovalThresholdRecord>[] = useMemo(
    () => [
      {
        accessorKey: "entityName",
        header: "Entity",
        cell: ({ row }) => <span className="font-medium">{row.getValue("entityName")}</span>,
      },
      {
        accessorKey: "dealValueThreshold",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Deal Value
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => formatCurrency(row.getValue<number | null>("dealValueThreshold")),
      },
      {
        accessorKey: "discountThresholdPct",
        header: "Discount %",
        cell: ({ row }) => {
          const val = row.getValue<number | null>("discountThresholdPct")
          return val != null ? <span>{val}%</span> : <span className="text-muted-foreground">—</span>
        },
      },
      {
        accessorKey: "confidentialTierRequired",
        header: "Confidential Tier",
        cell: ({ row }) => {
          const val = row.getValue<string | null>("confidentialTierRequired")
          return val ? <Badge variant="secondary">{val}</Badge> : <span className="text-muted-foreground">—</span>
        },
      },
      {
        accessorKey: "approverRole",
        header: "Approver Role",
        cell: ({ row }) => <Badge variant="outline">{row.getValue("approverRole")}</Badge>,
      },
      {
        id: "actions",
        header: "",
        size: 100,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <UpsertThresholdDialog entities={entities} thresholds={thresholds} upsertAction={upsertAction} existing={record} />
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
                aria-label={`Delete ${record.entityName}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )
        },
      },
    ],
    [entities, thresholds, upsertAction, deleteAction, router, deletingId],
  )

  const table = useReactTable({
    data: thresholds,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const unconfiguredEntities = entities.filter((e) => !thresholds.some((t) => t.entityId === e.id))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approval Thresholds</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set deal value, discount, and confidentiality approval rules per entity.
          </p>
        </div>
        {unconfiguredEntities.length > 0 && (
              <UpsertThresholdDialog entities={entities} thresholds={thresholds} upsertAction={upsertAction} />
        )}
      </div>

      {thresholds.length > 0 ? (
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
            <div className="text-2xl text-muted-foreground">🛡️</div>
            <div>
              <h2 className="text-base font-medium">No approval thresholds</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add thresholds to enforce approval rules per entity.
              </p>
            </div>
            {unconfiguredEntities.length > 0 && (
          <UpsertThresholdDialog entities={entities} thresholds={thresholds} upsertAction={upsertAction} />
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
