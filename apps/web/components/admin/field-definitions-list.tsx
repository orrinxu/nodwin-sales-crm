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
import { GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import type {
  CreateFieldDefinitionInput,
  FieldDefinition,
  UpdateFieldDefinitionInput,
  ReorderFieldDefinitionsInput,
} from "@/lib/data/field-definitions.types"
import type {
  FileTypeCategory,
  CreateFileTypeCategoryInput,
  UpdateFileTypeCategoryInput,
  ReorderFileTypeCategoriesInput,
} from "@/lib/data/file-type-categories.types"
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
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"

interface FieldDefinitionsListProps {
  fieldDefinitions: FieldDefinition[]
  fileTypeCategories: FileTypeCategory[]
  createAction: (input: CreateFieldDefinitionInput) => Promise<void>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  softDeleteAction: (id: string) => Promise<void>
  updateAction: (input: UpdateFieldDefinitionInput) => Promise<void>
  reorderAction: (input: ReorderFieldDefinitionsInput) => Promise<void>
  createFileTypeCategoryAction: (input: CreateFileTypeCategoryInput) => Promise<void>
  updateFileTypeCategoryAction: (input: UpdateFileTypeCategoryInput) => Promise<void>
  deleteFileTypeCategoryAction: (code: string) => Promise<void>
  reorderFileTypeCategoriesAction: (input: ReorderFileTypeCategoriesInput) => Promise<void>
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
  fileTypeCategories,
  createAction,
  bulkDeleteAction,
  softDeleteAction,
  updateAction,
  reorderAction,
  createFileTypeCategoryAction,
  updateFileTypeCategoryAction,
  deleteFileTypeCategoryAction,
  reorderFileTypeCategoriesAction,
}: FieldDefinitionsListProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("fields")
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

  const [ftcItems, setFtcItems] = useState<FileTypeCategory[]>(fileTypeCategories)
  const [showFtcCreateDialog, setShowFtcCreateDialog] = useState(false)
  const [showFtcEditDialog, setShowFtcEditDialog] = useState(false)
  const [showFtcDeleteDialog, setShowFtcDeleteDialog] = useState(false)
  const [editingFtc, setEditingFtc] = useState<FileTypeCategory | null>(null)
  const [deletingFtc, setDeletingFtc] = useState<FileTypeCategory | null>(null)
  const [ftcActiveDragId, setFtcActiveDragId] = useState<string | null>(null)
  const [ftcReorderError, setFtcReorderError] = useState<string | null>(null)

  const [ftcCreateCode, setFtcCreateCode] = useState("")
  const [ftcCreateLabel, setFtcCreateLabel] = useState("")
  const [ftcCreateDescription, setFtcCreateDescription] = useState("")
  const [ftcCreateDisplayOrder, setFtcCreateDisplayOrder] = useState(0)

  const [ftcEditLabel, setFtcEditLabel] = useState("")
  const [ftcEditDescription, setFtcEditDescription] = useState("")
  const [ftcEditActive, setFtcEditActive] = useState(true)
  const [ftcEditDisplayOrder, setFtcEditDisplayOrder] = useState(0)

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

  const openFtcEditDialog = useCallback((ftc: FileTypeCategory) => {
    setEditingFtc(ftc)
    setFtcEditLabel(ftc.label)
    setFtcEditDescription(ftc.description ?? "")
    setFtcEditActive(ftc.active)
    setFtcEditDisplayOrder(ftc.displayOrder)
    setShowFtcEditDialog(true)
  }, [])

  const openFtcDeleteDialog = useCallback((ftc: FileTypeCategory) => {
    setDeletingFtc(ftc)
    setShowFtcDeleteDialog(true)
  }, [])

  const handleFtcCreate = useCallback(async () => {
    setIsPending(true)
    setFtcReorderError(null)
    try {
      await createFileTypeCategoryAction({
        code: ftcCreateCode.trim(),
        label: ftcCreateLabel.trim(),
        description: ftcCreateDescription.trim() || null,
        displayOrder: ftcCreateDisplayOrder,
      })
      setFtcCreateCode("")
      setFtcCreateLabel("")
      setFtcCreateDescription("")
      setFtcCreateDisplayOrder(0)
      setShowFtcCreateDialog(false)
      router.refresh()
    } catch (err) {
      setFtcReorderError(err instanceof Error ? err.message : "Failed to create file type category.")
    } finally {
      setIsPending(false)
    }
  }, [
    ftcCreateCode,
    ftcCreateLabel,
    ftcCreateDescription,
    ftcCreateDisplayOrder,
    createFileTypeCategoryAction,
    router,
  ])

  const handleFtcEdit = useCallback(async () => {
    if (!editingFtc) return
    setIsPending(true)
    setFtcReorderError(null)
    try {
      await updateFileTypeCategoryAction({
        code: editingFtc.code,
        label: ftcEditLabel,
        description: ftcEditDescription.trim() || null,
        active: ftcEditActive,
        displayOrder: ftcEditDisplayOrder,
      })
      setEditingFtc(null)
      setShowFtcEditDialog(false)
      router.refresh()
    } catch (err) {
      setFtcReorderError(err instanceof Error ? err.message : "Failed to update file type category.")
    } finally {
      setIsPending(false)
    }
  }, [
    editingFtc,
    ftcEditLabel,
    ftcEditDescription,
    ftcEditActive,
    ftcEditDisplayOrder,
    updateFileTypeCategoryAction,
    router,
  ])

  const handleFtcDelete = useCallback(async () => {
    if (!deletingFtc) return
    setIsPending(true)
    setFtcReorderError(null)
    try {
      await deleteFileTypeCategoryAction(deletingFtc.code)
      setDeletingFtc(null)
      setShowFtcDeleteDialog(false)
      router.refresh()
    } catch (err) {
      setFtcReorderError(err instanceof Error ? err.message : "Failed to delete file type category.")
    } finally {
      setIsPending(false)
    }
  }, [deletingFtc, deleteFileTypeCategoryAction, router])

  const handleFtcDragStart = useCallback((event: DragStartEvent) => {
    setFtcActiveDragId(event.active.id as string)
    setFtcReorderError(null)
  }, [])

  const handleFtcDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setFtcActiveDragId(null)
      setFtcReorderError(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = ftcItems.findIndex((f) => f.code === active.id)
      const newIndex = ftcItems.findIndex((f) => f.code === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const previousItems = ftcItems
      const reordered = [...ftcItems]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)

      setFtcItems(reordered)

      try {
        await reorderFileTypeCategoriesAction({
          codes: reordered.map((f) => f.code),
        })
        router.refresh()
      } catch {
        setFtcItems(previousItems)
        setFtcReorderError("Failed to reorder categories. Please try again.")
      }
    },
    [ftcItems, reorderFileTypeCategoriesAction, router],
  )

  const ftcColumns: ColumnDef<FileTypeCategory>[] = useMemo(
    () => [
      {
        id: "drag",
        header: "",
        size: 40,
        cell: ({ row }) => {
          const ftc = row.original
          return <DragHandle id={ftc.code} />
        },
      },
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {row.getValue<string>("code")}
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
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => {
          const desc = row.getValue<string | null>("description")
          return desc ? (
            <span className="text-sm text-muted-foreground line-clamp-1 max-w-[300px] inline-block">
              {desc}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground/50">&mdash;</span>
          )
        },
      },
      {
        accessorKey: "active",
        header: "Active",
        size: 80,
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
          const ftc = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openFtcEditDialog(ftc)}
                aria-label={`Edit ${ftc.label}`}
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openFtcDeleteDialog(ftc)}
                aria-label={`Delete ${ftc.label}`}
              >
                <Trash2Icon className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )
        },
      },
    ],
    [openFtcEditDialog, openFtcDeleteDialog],
  )

  const ftcTable = useReactTable({
    data: ftcItems,
    columns: ftcColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const activeFtcDrag = useMemo(
    () => ftcItems.find((f) => f.code === ftcActiveDragId) ?? null,
    [ftcItems, ftcActiveDragId],
  )

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
          <p className="mt-1 text-sm text-muted-foreground">
            Manage custom field definitions across all entity types.
          </p>
        </div>
        {activeTab === "fields" ? (
          <FieldDefinitionDialog createAction={createAction} />
        ) : (
          <Button variant="default" size="sm" onClick={() => setShowFtcCreateDialog(true)}>
            <PlusIcon className="h-4 w-4" />
            Add File Type
          </Button>
        )}
      </div>

      <div className="flex-1 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTab value="fields">Custom Fields</TabsTab>
            <TabsTab value="fileTypes">File Type Categories</TabsTab>
          </TabsList>

          <TabsPanel value="fields">
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
          </TabsPanel>

          <TabsPanel value="fileTypes">
            <div className="space-y-4">
              {ftcReorderError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <span>{ftcReorderError}</span>
                  <button
                    className="ml-auto text-destructive/70 hover:text-destructive"
                    onClick={() => setFtcReorderError(null)}
                    aria-label="Dismiss error"
                  >
                    &times;
                  </button>
                </div>
              )}

              <div className="rounded-lg border">
                <DndContext
                  sensors={sensors}
                  onDragStart={handleFtcDragStart}
                  onDragEnd={handleFtcDragEnd}
                >
                  <Table>
                    <TableHeader>
                      {ftcTable.getHeaderGroups().map((headerGroup) => (
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
                      {ftcTable.getRowModel().rows.length > 0 ? (
                        <SortableContext
                          items={ftcItems.map((f) => f.code)}
                          strategy={verticalListSortingStrategy}
                        >
                          {ftcTable.getRowModel().rows.map((row) => (
                            <SortableTableRow
                              key={row.original.code}
                              id={row.original.code}
                              isSelected={false}
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
                            colSpan={ftcColumns.length}
                            className="h-24 text-center text-muted-foreground"
                          >
                            No file type categories defined yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <DragOverlay>
                    {activeFtcDrag ? (
                      <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 shadow-lg">
                        <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                          {activeFtcDrag.code}
                        </code>
                        <span className="font-medium">{activeFtcDrag.label}</span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          </TabsPanel>
        </Tabs>
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

      <Dialog open={showFtcCreateDialog} onOpenChange={setShowFtcCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add File Type Category</DialogTitle>
            <DialogDescription>
              Define a new file type category (e.g. &ldquo;contract&rdquo;, &ldquo;invoice&rdquo;).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ftc-code">Code</Label>
              <Input
                id="ftc-code"
                value={ftcCreateCode}
                onChange={(e) => setFtcCreateCode(e.target.value)}
                placeholder="e.g. contract"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and underscores. Must start with a letter.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ftc-label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ftc-label"
                value={ftcCreateLabel}
                onChange={(e) => setFtcCreateLabel(e.target.value)}
                placeholder="e.g. Contract"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ftc-description">Description</Label>
              <Input
                id="ftc-description"
                value={ftcCreateDescription}
                onChange={(e) => setFtcCreateDescription(e.target.value)}
                placeholder="Brief description of this file type"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ftc-display-order">Display Order</Label>
              <Input
                id="ftc-display-order"
                type="number"
                min={0}
                value={ftcCreateDisplayOrder}
                onChange={(e) => setFtcCreateDisplayOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFtcCreateDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFtcCreate}
              disabled={isPending || !ftcCreateCode.trim() || !ftcCreateLabel.trim()}
            >
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFtcEditDialog} onOpenChange={setShowFtcEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit File Type Category</DialogTitle>
            <DialogDescription>
              Update the properties for &ldquo;{editingFtc?.label}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ftc-edit-label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ftc-edit-label"
                value={ftcEditLabel}
                onChange={(e) => setFtcEditLabel(e.target.value)}
                placeholder="Display label"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ftc-edit-description">Description</Label>
              <Input
                id="ftc-edit-description"
                value={ftcEditDescription}
                onChange={(e) => setFtcEditDescription(e.target.value)}
                placeholder="Brief description of this file type"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ftc-edit-display-order">Display Order</Label>
              <Input
                id="ftc-edit-display-order"
                type="number"
                min={0}
                value={ftcEditDisplayOrder}
                onChange={(e) => setFtcEditDisplayOrder(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ftc-edit-active"
                checked={ftcEditActive}
                onCheckedChange={(value) => setFtcEditActive(!!value)}
              />
              <Label htmlFor="ftc-edit-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFtcEditDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFtcEdit}
              disabled={isPending || !ftcEditLabel.trim()}
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFtcDeleteDialog} onOpenChange={setShowFtcDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File Type Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingFtc?.label}&rdquo;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFtcDeleteDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFtcDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
