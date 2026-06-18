"use client"

import { useMemo, useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import {
  ArrowUpDown,
  Download,
  FileDown,
  HardDrive,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
} from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import type { EntityRecord } from "@/lib/data/entities"
import type {
  FinanceExportConfigRecord,
  FinanceExportConfigCreateInput,
  FinanceExportConfigUpdateInput,
  ImportJobRecord,
} from "@/lib/data/data-management"

const exportTargetTypes = [
  { value: "accounts", label: "Accounts" },
  { value: "contacts", label: "Contacts" },
  { value: "opportunities", label: "Opportunities" },
]

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

const statusBadgeVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  running: "default",
  completed: "outline",
  failed: "destructive",
}

const emptyToNull = (v: string) => (v === "" ? null : v)

const configFormSchema = z.object({
  entityId: z.string().uuid("Entity is required"),
  destinationDriveFolderId: z.string().optional().or(z.literal("")),
  schedule: z.string().optional().or(z.literal("")),
  enabled: z.boolean(),
})

type ConfigFormData = z.infer<typeof configFormSchema>

interface DataManagementListProps {
  entities: EntityRecord[]
  configs: FinanceExportConfigRecord[]
  jobs: ImportJobRecord[]
  getConfigsAction: () => Promise<FinanceExportConfigRecord[]>
  createConfigAction: (
    input: FinanceExportConfigCreateInput,
  ) => Promise<FinanceExportConfigRecord>
  updateConfigAction: (
    id: string,
    input: FinanceExportConfigUpdateInput,
  ) => Promise<FinanceExportConfigRecord>
  deleteConfigAction: (id: string) => Promise<void>
  getJobsAction: () => Promise<ImportJobRecord[]>
  createExportJobAction: (input: {
    kind: "export"
    targetEntityType: string
  }) => Promise<ImportJobRecord>
}

function ConfigDialog({
  entities,
  config,
  open,
  onOpenChange,
  saveAction,
}: {
  entities: EntityRecord[]
  config?: FinanceExportConfigRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  saveAction:
    | DataManagementListProps["createConfigAction"]
    | DataManagementListProps["updateConfigAction"]
}) {
  const router = useRouter()
  const isEdit = !!config
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      entityId: config?.entityId ?? "",
      destinationDriveFolderId: config?.destinationDriveFolderId ?? "",
      schedule: config?.schedule ?? "",
      enabled: config?.enabled ?? false,
    },
  })

  async function onSubmit(data: ConfigFormData) {
    setPending(true)
    setError(null)
    try {
      if (isEdit) {
        await (
          saveAction as DataManagementListProps["updateConfigAction"]
        )(config.id, {
          destinationDriveFolderId: emptyToNull(
            data.destinationDriveFolderId ?? "",
          ),
          schedule: emptyToNull(data.schedule ?? ""),
          enabled: data.enabled,
        })
      } else {
        await (
          saveAction as DataManagementListProps["createConfigAction"]
        )({
          entityId: data.entityId,
          destinationDriveFolderId: emptyToNull(
            data.destinationDriveFolderId ?? "",
          ),
          schedule: emptyToNull(data.schedule ?? ""),
          enabled: data.enabled,
        })
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save config.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit Export Config" : "Add Export Config"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the export configuration for this entity."
                : "Add a new finance export configuration for an entity."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="config-entity">
                Entity <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="entityId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit}
                  >
                    <SelectTrigger id="config-entity">
                      <SelectValue placeholder="Select entity..." />
                    </SelectTrigger>
                    <SelectContent>
                      {entities
                        .filter((e) => e.active)
                        .map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.entityId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.entityId.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="config-drive-folder">
                Drive Folder ID
              </Label>
              <Input
                id="config-drive-folder"
                {...form.register("destinationDriveFolderId")}
                placeholder="Google Drive folder ID"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="config-schedule">
                Schedule (cron expression)
              </Label>
              <Input
                id="config-schedule"
                {...form.register("schedule")}
                placeholder="e.g. 0 6 * * *"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="config-format">Format (JSON)</Label>
              <pre className="max-h-32 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs text-muted-foreground">
                {config?.format
                  ? JSON.stringify(config.format, null, 2)
                  : "{}"}
              </pre>
              <p className="text-xs text-muted-foreground">
                Read-only preview. Format configuration is managed via the
                API.
              </p>
            </div>

            <div className="flex items-center space-x-2 rounded-lg border p-3">
              <Controller
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <Checkbox
                    id="config-enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <div>
                <Label htmlFor="config-enabled" className="text-sm">
                  Enabled
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable scheduled exports for this entity.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
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

function DeleteConfigDialog({
  config,
  open,
  onOpenChange,
  deleteAction,
}: {
  config: FinanceExportConfigRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deleteAction: DataManagementListProps["deleteConfigAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDelete() {
    if (!config) return
    setPending(true)
    try {
      await deleteAction(config.id)
      onOpenChange(false)
      router.refresh()
    } catch {
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Export Config</DialogTitle>
          <DialogDescription>
            Remove the export configuration for &ldquo;
            {config?.entityName ?? "this entity"}&rdquo;? This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DataManagementList({
  entities,
  configs,
  jobs,
  createConfigAction,
  updateConfigAction,
  deleteConfigAction,
  createExportJobAction,
}: DataManagementListProps) {
  const router = useRouter()
  const [configSorting, setConfigSorting] = useState<SortingState>([])
  const [jobSorting, setJobSorting] = useState<SortingState>([])
  const [editingConfig, setEditingConfig] =
    useState<FinanceExportConfigRecord | null>(null)
  const [deletingConfig, setDeletingConfig] =
    useState<FinanceExportConfigRecord | null>(null)
  const [creatingConfig, setCreatingConfig] = useState(false)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [exportPending, setExportPending] = useState<string | null>(
    null,
  )

  async function handleExport(targetEntityType: string) {
    setExportPending(targetEntityType)
    try {
      await createExportJobAction({
        kind: "export",
        targetEntityType,
      })
      router.refresh()
    } catch {
    } finally {
      setExportPending(null)
    }
  }

  const configColumns: ColumnDef<FinanceExportConfigRecord>[] =
    useMemo(
      () => [
        {
          accessorKey: "entityName",
          header: ({ column }) => (
            <Button
              variant="ghost"
              className="-ml-3 h-8 data-[sorted]:text-foreground"
              onClick={() =>
                column.toggleSorting(
                  column.getIsSorted() === "asc",
                )
              }
            >
              Entity
              <ArrowUpDown className="ml-2 size-4" />
            </Button>
          ),
          cell: ({ row }) => (
            <span className="font-medium">
              {row.getValue("entityName") ?? "—"}
            </span>
          ),
        },
        {
          accessorKey: "destinationDriveFolderId",
          header: "Drive Folder",
          cell: ({ row }) => {
            const val = row.getValue(
              "destinationDriveFolderId",
            ) as string | null
            return val ? (
              <span className="font-mono text-xs">{val}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          },
        },
        {
          accessorKey: "schedule",
          header: "Schedule",
          cell: ({ row }) => {
            const val = row.getValue("schedule") as string | null
            return val ? (
              <span className="font-mono text-xs">{val}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          },
        },
        {
          accessorKey: "enabled",
          header: "Status",
          cell: ({ row }) =>
            row.getValue<boolean>("enabled") ? (
              <Badge variant="default">Enabled</Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            ),
        },
        {
          accessorKey: "createdAt",
          header: ({ column }) => (
            <Button
              variant="ghost"
              className="-ml-3 h-8 data-[sorted]:text-foreground"
              onClick={() =>
                column.toggleSorting(
                  column.getIsSorted() === "asc",
                )
              }
            >
              Created
              <ArrowUpDown className="ml-2 size-4" />
            </Button>
          ),
          cell: ({ row }) =>
            formatDate(row.getValue("createdAt")),
        },
        {
          id: "actions",
          header: "",
          size: 80,
          cell: ({ row }) => {
            const item = row.original
            return (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingConfig(item)}
                  aria-label={`Edit config for ${item.entityName}`}
                >
                  <PencilIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeletingConfig(item)}
                  aria-label={`Delete config for ${item.entityName}`}
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

  const jobColumns: ColumnDef<ImportJobRecord>[] = useMemo(
    () => [
      {
        accessorKey: "kind",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() =>
              column.toggleSorting(
                column.getIsSorted() === "asc",
              )
            }
          >
            Kind
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const kind = row.getValue("kind") as string
          return (
            <Badge variant="outline" className="capitalize">
              {kind}
            </Badge>
          )
        },
      },
      {
        accessorKey: "targetEntityType",
        header: "Target",
        cell: ({ row }) => {
          const val = row.getValue("targetEntityType") as
            | string
            | null
          return val ? (
            <span className="capitalize">{val}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue("status") as string
          const variant =
            statusBadgeVariant[
              status as keyof typeof statusBadgeVariant
            ] ?? "secondary"
          return (
            <Badge variant={variant}>
              {status}
            </Badge>
          )
        },
      },
      {
        accessorKey: "recordCount",
        header: "Records",
        cell: ({ row }) => {
          const val = row.getValue("recordCount") as
            | number
            | null
          return val !== null ? val : "—"
        },
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-3 h-8 data-[sorted]:text-foreground"
            onClick={() =>
              column.toggleSorting(
                column.getIsSorted() === "asc",
              )
            }
          >
            Created
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) =>
          formatDate(row.getValue("createdAt")),
      },
      {
        id: "error",
        header: "Error Log",
        cell: ({ row }) => {
          const errorLog = row.original.errorLog
          const jobId = row.original.id
          const isExpanded = expandedJob === jobId
          if (!errorLog) return <span className="text-muted-foreground">—</span>
          return (
            <div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() =>
                  setExpandedJob(
                    isExpanded ? null : jobId,
                  )
                }
              >
                {isExpanded ? "Hide" : "View"}
              </Button>
              {isExpanded && (
                <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                  {JSON.stringify(errorLog, null, 2)}
                </pre>
              )}
            </div>
          )
        },
      },
    ],
    [expandedJob],
  )

  const configTable = useReactTable({
    data: configs,
    columns: configColumns,
    state: { sorting: configSorting },
    onSortingChange: setConfigSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const jobTable = useReactTable({
    data: jobs,
    columns: jobColumns,
    state: { sorting: jobSorting },
    onSortingChange: setJobSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Data Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure finance exports and manage import/export jobs.
          </p>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Finance Export Configs
          </h2>
          <Button
            variant="default"
            size="sm"
            onClick={() => setCreatingConfig(true)}
          >
            <PlusIcon className="h-4 w-4" />
            Add Config
          </Button>
        </div>

        {configs.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                {configTable
                  .getHeaderGroups()
                  .map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{
                            width:
                              header.getSize() !== 150
                                ? header.getSize()
                                : undefined,
                          }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef
                                  .header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
              </TableHeader>
              <TableBody>
                {configTable.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
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
          </div>
        ) : (
          <Card className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <HardDrive className="size-10 text-muted-foreground" />
              <div>
                <h2 className="text-base font-medium">
                  No export configs
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a finance export config to configure
                  scheduled exports per entity.
                </p>
              </div>
            </div>
          </Card>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Import / Export
          </h2>
          <div className="flex items-center gap-2">
            {exportTargetTypes.map((t) => (
              <Button
                key={t.value}
                variant="outline"
                size="sm"
                disabled={exportPending === t.value}
                onClick={() => handleExport(t.value)}
              >
                <Download className="h-4 w-4" />
                {exportPending === t.value
                  ? "Exporting..."
                  : `Export ${t.label}`}
              </Button>
            ))}
          </div>
        </div>

        {jobs.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                {jobTable
                  .getHeaderGroups()
                  .map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{
                            width:
                              header.getSize() !== 150
                                ? header.getSize()
                                : undefined,
                          }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef
                                  .header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
              </TableHeader>
              <TableBody>
                {jobTable.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
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
          </div>
        ) : (
          <Card className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <FileDown className="size-10 text-muted-foreground" />
              <div>
                <h2 className="text-base font-medium">
                  No import/export jobs
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Trigger an export above to create a job.
                </p>
              </div>
            </div>
          </Card>
        )}
      </section>

      {creatingConfig && (
        <ConfigDialog
          entities={entities}
          open={creatingConfig}
          onOpenChange={(open) => {
            if (!open) setCreatingConfig(false)
          }}
          saveAction={createConfigAction}
        />
      )}

      {editingConfig && (
        <ConfigDialog
          entities={entities}
          config={editingConfig}
          open={!!editingConfig}
          onOpenChange={(open) => {
            if (!open) setEditingConfig(null)
          }}
          saveAction={updateConfigAction}
        />
      )}

      <DeleteConfigDialog
        config={deletingConfig}
        open={!!deletingConfig}
        onOpenChange={(open) => {
          if (!open) setDeletingConfig(null)
        }}
        deleteAction={deleteConfigAction}
      />
    </div>
  )
}
