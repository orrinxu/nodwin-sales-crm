"use client"

import { useCallback, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { GripVerticalIcon, PencilIcon, Trash2Icon } from "lucide-react"

import type {
  CreateFieldDefinitionInput,
  FieldDefinition,
  UpdateFieldDefinitionInput,
} from "@/lib/data/field-definitions"
import type { ReorderFieldDefinitionsInput } from "@/lib/data/field-definitions"
import { FieldDefinitionDialog } from "@/components/admin/field-definition-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

interface FieldDefinitionsListProps {
  fieldDefinitions: FieldDefinition[]
  createAction: (input: CreateFieldDefinitionInput) => Promise<void>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  softDeleteAction: (id: string) => Promise<void>
  updateAction: (input: UpdateFieldDefinitionInput) => Promise<void>
  reorderAction: (input: ReorderFieldDefinitionsInput) => Promise<void>
}

function getDataTypeVariant(dt: string): "default" | "secondary" | "outline" | "destructive" {
  switch (dt) {
    case "text":
    case "currency":
    case "boolean":
      return "default"
    case "rich_text":
    case "date":
    case "datetime":
    case "user_ref":
    case "account_ref":
      return "secondary"
    case "number":
    case "single_select":
    case "multi_select":
    case "url":
      return "outline"
    case "formula":
      return "destructive"
    default:
      return "outline"
  }
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners, setActivatorNodeRef } = useSortable({ id })
  return (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
      aria-label="Drag to reorder"
    >
      <GripVerticalIcon className="h-4 w-4" />
    </button>
  )
}

function SortableTableRow({
  id,
  isSelected,
  children,
}: {
  id: string
  isSelected: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: "relative" as const,
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-state={isSelected ? "selected" : undefined}
    >
      {children}
    </TableRow>
  )
}

export function FieldDefinitionsList({
  fieldDefinitions,
  createAction,
  bulkDeleteAction,
  softDeleteAction,
  updateAction,
  reorderAction,
}: FieldDefinitionsListProps) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showSingleDeleteDialog, setShowSingleDeleteDialog] = useState(false)
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null)
  const [deletingField, setDeletingField] = useState<FieldDefinition | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)

  const [editLabel, setEditLabel] = useState("")
  const [editRequired, setEditRequired] = useState(false)
  const [editOptions, setEditOptions] = useState("")
  const [editDisplayOrder, setEditDisplayOrder] = useState(0)

  const [items, setItems] = useState<FieldDefinition[]>(fieldDefinitions)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, isSelected]) => isSelected)
        .map(([key]) => items.at(Number(key))?.id)
        .filter((id): id is string => !!id),
    [rowSelection, items],
  )

  const openEditDialog = useCallback((field: FieldDefinition) => {
    setEditingField(field)
    setEditLabel(field.label)
    setEditRequired(field.required)
    setEditOptions(field.options?.join(", ") ?? "")
    setEditDisplayOrder(field.displayOrder)
    setShowEditDialog(true)
  }, [])

  const openSingleDeleteDialog = useCallback((field: FieldDefinition) => {
    setDeletingField(field)
    setShowSingleDeleteDialog(true)
  }, [])

  const columns: ColumnDef<FieldDefinition>[] = useMemo(
    () => [
      {
        id: "drag",
        header: "",
        size: 40,
        cell: ({ row }) => {
          const field = row.original
          return <DragHandle id={field.id} />
        },
      },
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
        accessorKey: "entityType",
        header: "Entity",
        cell: ({ row }) => (
          <Badge variant="secondary" className="capitalize">
            {row.getValue<string>("entityType")}
          </Badge>
        ),
      },
      {
        accessorKey: "key",
        header: "Key",
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {row.getValue<string>("key")}
          </code>
        ),
      },
      {
        accessorKey: "label",
        header: "Label",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue<string>("label")}</span>
        ),
      },
      {
        accessorKey: "dataType",
        header: "Type",
        cell: ({ row }) => {
          const dt = row.getValue<string>("dataType")
          return (
            <Badge variant={getDataTypeVariant(dt)}>
              {dt.replace(/_/g, " ")}
            </Badge>
          )
        },
      },
      {
        accessorKey: "required",
        header: "Required",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.getValue<boolean>("required") ? "Yes" : "No"}
          </span>
        ),
      },
      {
        accessorKey: "active",
        header: "Active",
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
          const field = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEditDialog(field)}
                aria-label={`Edit ${field.label}`}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openSingleDeleteDialog(field)}
                aria-label={`Delete ${field.label}`}
              >
                <Trash2Icon className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )
        },
      },
    ],
    [openEditDialog, openSingleDeleteDialog],
  )

  const table = useReactTable({
    data: items,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
    setReorderError(null)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null)
      setReorderError(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex((f) => f.id === active.id)
      const newIndex = items.findIndex((f) => f.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const previousItems = items
      const reordered = [...items]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)

      const withUpdatedOrder = reordered.map((f, i) => ({
        ...f,
        displayOrder: i,
      }))

      setItems(withUpdatedOrder)

      try {
        await reorderAction({
          items: withUpdatedOrder.map((f) => ({
            id: f.id,
            displayOrder: f.displayOrder,
          })),
        })
        router.refresh()
      } catch {
        setItems(previousItems)
        setReorderError("Failed to reorder fields. Please try again.")
      }
    },
    [items, reorderAction, router],
  )

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    setIsPending(true)
    try {
      await bulkDeleteAction({ ids: selectedIds })
      setRowSelection({})
      setShowDeleteDialog(false)
      router.refresh()
    } catch {
      // handled by caller
    } finally {
      setIsPending(false)
    }
  }, [selectedIds, bulkDeleteAction, router])

  const handleSingleDelete = useCallback(async () => {
    if (!deletingField) return
    setIsPending(true)
    try {
      await softDeleteAction(deletingField.id)
      setDeletingField(null)
      setShowSingleDeleteDialog(false)
      router.refresh()
    } catch {
      // handled by caller
    } finally {
      setIsPending(false)
    }
  }, [deletingField, softDeleteAction, router])

  const handleEdit = useCallback(async () => {
    if (!editingField) return
    setIsPending(true)
    try {
      const isSelectType =
        editingField.dataType === "single_select" || editingField.dataType === "multi_select"
      await updateAction({
        id: editingField.id,
        label: editLabel,
        required: editRequired,
        options: isSelectType
          ? editOptions
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        displayOrder: editDisplayOrder,
        visibleToRoles: editingField.visibleToRoles,
        editableByRoles: editingField.editableByRoles,
      })
      setEditingField(null)
      setShowEditDialog(false)
      router.refresh()
    } catch {
      // handled by caller
    } finally {
      setIsPending(false)
    }
  }, [
    editingField,
    editLabel,
    editRequired,
    editOptions,
    editDisplayOrder,
    updateAction,
    router,
  ])

  const showOptionsField =
    editingField?.dataType === "single_select" || editingField?.dataType === "multi_select"

  const activeDragField = useMemo(
    () => items.find((f) => f.id === activeDragId) ?? null,
    [items, activeDragId],
  )

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Custom Fields
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage custom field definitions across all entity types.
          </p>
        </div>
        <FieldDefinitionDialog createAction={createAction} />
      </div>

      <div className="flex-1 p-6">
        <div className="space-y-4">
          {reorderError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{reorderError}</span>
              <button
                className="ml-auto text-destructive/70 hover:text-destructive"
                onClick={() => setReorderError(null)}
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2Icon />
                  Deactivate
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border">
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
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
                  {table.getRowModel().rows.length > 0 ? (
                    <SortableContext
                      items={items.map((f) => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {table.getRowModel().rows.map((row) => (
                        <SortableTableRow
                          key={row.original.id}
                          id={row.original.id}
                          isSelected={row.getIsSelected()}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </SortableTableRow>
                      ))}
                    </SortableContext>
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No custom fields defined yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <DragOverlay>
                {activeDragField ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 shadow-lg">
                    <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="secondary" className="capitalize">
                      {activeDragField.entityType}
                    </Badge>
                    <span className="font-medium">{activeDragField.label}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Field Definitions</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate {selectedIds.length} field
              definition{selectedIds.length !== 1 ? "s" : ""}? Inactive fields
              are hidden from forms but existing data is preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isPending}
            >
              {isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSingleDeleteDialog} onOpenChange={setShowSingleDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Field Definition</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate &ldquo;{deletingField?.label}&rdquo;?
              Inactive fields are hidden from forms but existing data is preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSingleDeleteDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSingleDelete}
              disabled={isPending}
            >
              {isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Field Definition</DialogTitle>
            <DialogDescription>
              Update the properties for &ldquo;{editingField?.label}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-label">Label</Label>
              <Input
                id="edit-label"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Display label"
              />
            </div>
            {showOptionsField && (
              <div className="grid gap-2">
                <Label htmlFor="edit-options">Options (comma-separated)</Label>
                <Input
                  id="edit-options"
                  value={editOptions}
                  onChange={(e) => setEditOptions(e.target.value)}
                  placeholder="Option 1, Option 2, Option 3"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="edit-display-order">Display Order</Label>
              <Input
                id="edit-display-order"
                type="number"
                min={0}
                value={editDisplayOrder}
                onChange={(e) => setEditDisplayOrder(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-required"
                checked={editRequired}
                onCheckedChange={(value) => setEditRequired(!!value)}
              />
              <Label htmlFor="edit-required">Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isPending || !editLabel.trim()}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
