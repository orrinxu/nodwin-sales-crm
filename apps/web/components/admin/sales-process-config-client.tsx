"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  GripVertical,
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
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"

import type { PipelineStage, LossReason, ProjectType, RevenueCategory, StageGateRule } from "@/lib/data/sales-process-config"
import { stageGateRuleEntityTypes } from "@/lib/data/sales-process-config"

import {
  createPipelineStageAction,
  updatePipelineStageAction,
  softDeletePipelineStageAction,
  reorderPipelineStagesAction,
  createLossReasonAction,
  updateLossReasonAction,
  softDeleteLossReasonAction,
  reorderLossReasonsAction,
  createProjectTypeAction,
  updateProjectTypeAction,
  softDeleteProjectTypeAction,
  reorderProjectTypesAction,
  createRevenueCategoryAction,
  updateRevenueCategoryAction,
  softDeleteRevenueCategoryAction,
  reorderRevenueCategoriesAction,
  createStageGateRuleAction,
  updateStageGateRuleAction,
  softDeleteStageGateRuleAction,
} from "@/app/(crm)/admin/sales-process/actions"

interface SalesProcessConfigClientProps {
  pipelineStages: PipelineStage[]
  lossReasons: LossReason[]
  projectTypes: ProjectType[]
  revenueCategories: RevenueCategory[]
  stageGateRules: StageGateRule[]
}

// ── Generic Sortable Table ───────────────────────────────────────────────────

interface SortableTableProps<T> {
  items: T[]
  columns: { key: string; header: string; render: (item: T) => React.ReactNode }[]
  onReorder: (items: T[]) => void
  onEdit: (item: T) => void
  onDelete: (item: T) => void
  idKey: keyof T
}

/* eslint-disable security/detect-object-injection -- idKey is a typed keyof T */
function SortableTable<T extends { sortOrder: number }>({
  items,
  columns,
  onReorder,
  onEdit,
  onDelete,
  idKey,
}: SortableTableProps<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder)

  const handleDragStart = (id: string) => {
    setDraggedId(id)
  }

  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault()
    if (draggedId === null || draggedId === overId) return

    const fromIndex = sortedItems.findIndex((item) => String(item[idKey]) === draggedId)
    const toIndex = sortedItems.findIndex((item) => String(item[idKey]) === overId)
    if (fromIndex === -1 || toIndex === -1) return

    const newItems = [...sortedItems]
    const [moved] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, moved)

    const reordered = newItems.map((item, idx) => ({
      ...item,
      sortOrder: idx,
    }))
    onReorder(reordered)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"></TableHead>
          {columns.map((col) => (
            <TableHead key={col.key}>{col.header}</TableHead>
          ))}
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedItems.map((item) => (
          <TableRow
            key={String(item[idKey])}
            draggable
            onDragStart={() => handleDragStart(String(item[idKey]))}
            onDragOver={(e) => handleDragOver(e, String(item[idKey]))}
            onDragEnd={handleDragEnd}
            className={draggedId === String(item[idKey]) ? "opacity-50" : ""}
          >
            <TableCell>
              <GripVertical className="size-4 cursor-grab text-muted-foreground" />
            </TableCell>
            {columns.map((col) => (
              <TableCell key={col.key}>{col.render(item)}</TableCell>
            ))}
            <TableCell className="text-right">
              <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
                <PencilIcon className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(item)}>
                <Trash2Icon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
/* eslint-enable security/detect-object-injection */

// ── Pipeline Stages Tab ──────────────────────────────────────────────────────

const pipelineStageFormSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  winProbability: z.coerce.number().int().min(0).max(100).nullable().optional(),
  isWon: z.boolean(),
  isLost: z.boolean(),
})

type PipelineStageFormValues = z.infer<typeof pipelineStageFormSchema>

function PipelineStagesTab({ stages: initialStages }: { stages: PipelineStage[] }) {
  const [stages, setStages] = useState(initialStages)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PipelineStage | null>(null)

  const form = useForm<PipelineStageFormValues>({
    resolver: zodResolver(pipelineStageFormSchema),
    defaultValues: {
      key: "",
      label: "",
      winProbability: null,
      isWon: false,
      isLost: false,
    },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ key: "", label: "", winProbability: null, isWon: false, isLost: false })
    setDialogOpen(true)
  }

  const openEdit = (stage: PipelineStage) => {
    setEditing(stage)
    form.reset({
      id: stage.id,
      key: stage.key,
      label: stage.label,
      winProbability: stage.winProbability,
      isWon: stage.isWon,
      isLost: stage.isLost,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (values: PipelineStageFormValues) => {
    if (editing) {
      await updatePipelineStageAction({
        id: editing.id,
        label: values.label,
        winProbability: values.winProbability ?? null,
        isWon: values.isWon,
        isLost: values.isLost,
      })
    } else {
      await createPipelineStageAction({
        key: values.key,
        label: values.label,
        winProbability: values.winProbability ?? null,
        isWon: values.isWon,
        isLost: values.isLost,
        sortOrder: stages.length,
      })
    }
    setDialogOpen(false)
    window.location.reload()
  }

  const handleDelete = async (stage: PipelineStage) => {
    if (!confirm(`Deactivate stage "${stage.label}"?`)) return
    await softDeletePipelineStageAction(stage.id)
    window.location.reload()
  }

  const handleReorder = async (reordered: PipelineStage[]) => {
    setStages(reordered)
    await reorderPipelineStagesAction(
      reordered.map((s) => ({ id: s.id, sortOrder: s.sortOrder })),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Pipeline Stages</h3>
        <Button onClick={openCreate}>
          <PlusIcon className="mr-2 size-4" />
          Add Stage
        </Button>
      </div>

      <Card>
        <SortableTable
          items={stages.filter((s) => s.active)}
          idKey="id"
          onReorder={handleReorder}
          onEdit={openEdit}
          onDelete={handleDelete}
          columns={[
            {
              key: "label",
              header: "Label",
              render: (s) => <span className="font-medium">{s.label}</span>,
            },
            {
              key: "key",
              header: "Key",
              render: (s) => <code className="text-muted-foreground text-sm">{s.key}</code>,
            },
            {
              key: "winProbability",
              header: "Win Probability",
              render: (s) =>
                s.winProbability !== null ? `${s.winProbability}%` : "—",
            },
            {
              key: "status",
              header: "Status",
              render: (s) => (
                <div className="flex gap-1">
                  {s.isWon && <Badge variant="default">Won</Badge>}
                  {s.isLost && <Badge variant="destructive">Lost</Badge>}
                  {!s.isWon && !s.isLost && <Badge variant="outline">Open</Badge>}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Stage" : "Add Stage"}</DialogTitle>
            <DialogDescription>
              Configure pipeline stage metadata.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                {...form.register("key")}
                disabled={!!editing}
                placeholder="e.g. verbal_agreement"
              />
              {form.formState.errors.key && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.key.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="label">Label</Label>
              <Input id="label" {...form.register("label")} placeholder="e.g. Verbal Agreement" />
            </div>
            <div>
              <Label htmlFor="winProbability">Win Probability (%)</Label>
              <Input
                id="winProbability"
                type="number"
                min={0}
                max={100}
                {...form.register("winProbability")}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isWon"
                  checked={form.watch("isWon")}
                  onCheckedChange={(v) => form.setValue("isWon", !!v)}
                />
                <Label htmlFor="isWon">Won stage</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isLost"
                  checked={form.watch("isLost")}
                  onCheckedChange={(v) => form.setValue("isLost", !!v)}
                />
                <Label htmlFor="isLost">Lost stage</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Loss Reasons Tab ─────────────────────────────────────────────────────────

const lossReasonFormSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(200),
})

type LossReasonFormValues = z.infer<typeof lossReasonFormSchema>

function LossReasonsTab({ reasons: initialReasons }: { reasons: LossReason[] }) {
  const [reasons, setReasons] = useState(initialReasons)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LossReason | null>(null)

  const form = useForm<LossReasonFormValues>({
    resolver: zodResolver(lossReasonFormSchema),
    defaultValues: { label: "" },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ label: "" })
    setDialogOpen(true)
  }

  const openEdit = (reason: LossReason) => {
    setEditing(reason)
    form.reset({ id: reason.id, label: reason.label })
    setDialogOpen(true)
  }

  const onSubmit = async (values: LossReasonFormValues) => {
    if (editing) {
      await updateLossReasonAction({ id: editing.id, label: values.label })
    } else {
      await createLossReasonAction({ label: values.label, sortOrder: reasons.length })
    }
    setDialogOpen(false)
    window.location.reload()
  }

  const handleDelete = async (reason: LossReason) => {
    if (!confirm(`Deactivate reason "${reason.label}"?`)) return
    await softDeleteLossReasonAction(reason.id)
    window.location.reload()
  }

  const handleReorder = async (reordered: LossReason[]) => {
    setReasons(reordered)
    await reorderLossReasonsAction(
      reordered.map((r) => ({ id: r.id, sortOrder: r.sortOrder })),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Loss Reasons</h3>
        <Button onClick={openCreate}>
          <PlusIcon className="mr-2 size-4" />
          Add Reason
        </Button>
      </div>

      <Card>
        <SortableTable
          items={reasons.filter((r) => r.active)}
          idKey="id"
          onReorder={handleReorder}
          onEdit={openEdit}
          onDelete={handleDelete}
          columns={[
            {
              key: "label",
              header: "Label",
              render: (r) => <span className="font-medium">{r.label}</span>,
            },
          ]}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Reason" : "Add Reason"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="label">Label</Label>
              <Input id="label" {...form.register("label")} />
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Project Types Tab ────────────────────────────────────────────────────────

const projectTypeFormSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
})

type ProjectTypeFormValues = z.infer<typeof projectTypeFormSchema>

function ProjectTypesTab({ types: initialTypes }: { types: ProjectType[] }) {
  const [types, setTypes] = useState(initialTypes)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectType | null>(null)

  const form = useForm<ProjectTypeFormValues>({
    resolver: zodResolver(projectTypeFormSchema),
    defaultValues: { key: "", label: "" },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ key: "", label: "" })
    setDialogOpen(true)
  }

  const openEdit = (type: ProjectType) => {
    setEditing(type)
    form.reset({ id: type.id, key: type.key, label: type.label })
    setDialogOpen(true)
  }

  const onSubmit = async (values: ProjectTypeFormValues) => {
    if (editing) {
      await updateProjectTypeAction({ id: editing.id, label: values.label })
    } else {
      await createProjectTypeAction({
        key: values.key,
        label: values.label,
        sortOrder: types.length,
      })
    }
    setDialogOpen(false)
    window.location.reload()
  }

  const handleDelete = async (type: ProjectType) => {
    if (!confirm(`Deactivate type "${type.label}"?`)) return
    await softDeleteProjectTypeAction(type.id)
    window.location.reload()
  }

  const handleReorder = async (reordered: ProjectType[]) => {
    setTypes(reordered)
    await reorderProjectTypesAction(
      reordered.map((t) => ({ id: t.id, sortOrder: t.sortOrder })),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Project Types</h3>
        <Button onClick={openCreate}>
          <PlusIcon className="mr-2 size-4" />
          Add Type
        </Button>
      </div>

      <Card>
        <SortableTable
          items={types.filter((t) => t.active)}
          idKey="id"
          onReorder={handleReorder}
          onEdit={openEdit}
          onDelete={handleDelete}
          columns={[
            {
              key: "label",
              header: "Label",
              render: (t) => <span className="font-medium">{t.label}</span>,
            },
            {
              key: "key",
              header: "Key",
              render: (t) => <code className="text-muted-foreground text-sm">{t.key}</code>,
            },
          ]}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Type" : "Add Type"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                {...form.register("key")}
                disabled={!!editing}
                placeholder="e.g. white_label"
              />
            </div>
            <div>
              <Label htmlFor="label">Label</Label>
              <Input id="label" {...form.register("label")} placeholder="e.g. White Label" />
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Revenue Categories Tab ───────────────────────────────────────────────────

const revenueCategoryFormSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
})

type RevenueCategoryFormValues = z.infer<typeof revenueCategoryFormSchema>

function RevenueCategoriesTab({ categories: initialCategories }: { categories: RevenueCategory[] }) {
  const [categories, setCategories] = useState(initialCategories)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RevenueCategory | null>(null)

  const form = useForm<RevenueCategoryFormValues>({
    resolver: zodResolver(revenueCategoryFormSchema),
    defaultValues: { key: "", label: "" },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ key: "", label: "" })
    setDialogOpen(true)
  }

  const openEdit = (cat: RevenueCategory) => {
    setEditing(cat)
    form.reset({ id: cat.id, key: cat.key, label: cat.label })
    setDialogOpen(true)
  }

  const onSubmit = async (values: RevenueCategoryFormValues) => {
    if (editing) {
      await updateRevenueCategoryAction({ id: editing.id, label: values.label })
    } else {
      await createRevenueCategoryAction({
        key: values.key,
        label: values.label,
        sortOrder: categories.length,
      })
    }
    setDialogOpen(false)
    window.location.reload()
  }

  const handleDelete = async (cat: RevenueCategory) => {
    if (!confirm(`Deactivate category "${cat.label}"?`)) return
    await softDeleteRevenueCategoryAction(cat.id)
    window.location.reload()
  }

  const handleReorder = async (reordered: RevenueCategory[]) => {
    setCategories(reordered)
    await reorderRevenueCategoriesAction(
      reordered.map((c) => ({ id: c.id, sortOrder: c.sortOrder })),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Revenue Categories</h3>
        <Button onClick={openCreate}>
          <PlusIcon className="mr-2 size-4" />
          Add Category
        </Button>
      </div>

      <Card>
        <SortableTable
          items={categories.filter((c) => c.active)}
          idKey="id"
          onReorder={handleReorder}
          onEdit={openEdit}
          onDelete={handleDelete}
          columns={[
            {
              key: "label",
              header: "Label",
              render: (c) => <span className="font-medium">{c.label}</span>,
            },
            {
              key: "key",
              header: "Key",
              render: (c) => <code className="text-muted-foreground text-sm">{c.key}</code>,
            },
          ]}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                {...form.register("key")}
                disabled={!!editing}
                placeholder="e.g. live"
              />
            </div>
            <div>
              <Label htmlFor="label">Label</Label>
              <Input id="label" {...form.register("label")} placeholder="e.g. Live" />
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Stage Gate Rules Tab ─────────────────────────────────────────────────────

const stageGateRuleFormSchema = z.object({
  id: z.string().uuid().optional(),
  stageKey: z.string().min(1),
  entityType: z.enum(stageGateRuleEntityTypes),
  fieldKey: z.string().min(1).max(100),
  required: z.boolean(),
})

type StageGateRuleFormValues = z.infer<typeof stageGateRuleFormSchema>

function StageGateRulesTab({
  rules: initialRules,
  stages,
}: {
  rules: StageGateRule[]
  stages: PipelineStage[]
}) {
  const [rules] = useState(initialRules)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StageGateRule | null>(null)

  const form = useForm<StageGateRuleFormValues>({
    resolver: zodResolver(stageGateRuleFormSchema),
    defaultValues: {
      stageKey: "",
      entityType: "opportunity",
      fieldKey: "",
      required: true,
    },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({
      stageKey: "",
      entityType: "opportunity",
      fieldKey: "",
      required: true,
    })
    setDialogOpen(true)
  }

  const openEdit = (rule: StageGateRule) => {
    setEditing(rule)
    form.reset({
      id: rule.id,
      stageKey: rule.stageKey,
      entityType: rule.entityType,
      fieldKey: rule.fieldKey,
      required: rule.required,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (values: StageGateRuleFormValues) => {
    if (editing) {
      await updateStageGateRuleAction({
        id: editing.id,
        stageKey: values.stageKey,
        entityType: values.entityType,
        fieldKey: values.fieldKey,
        required: values.required,
      })
    } else {
      await createStageGateRuleAction({
        stageKey: values.stageKey,
        entityType: values.entityType,
        fieldKey: values.fieldKey,
        required: values.required,
      })
    }
    setDialogOpen(false)
    window.location.reload()
  }

  const handleDelete = async (rule: StageGateRule) => {
    if (!confirm("Deactivate this rule?")) return
    await softDeleteStageGateRuleAction(rule.id)
    window.location.reload()
  }

  const activeRules = rules.filter((r) => r.active)
  const stageMap = Object.fromEntries(stages.map((s) => [s.key, s.label]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Stage-Gate Rules</h3>
        <Button onClick={openCreate}>
          <PlusIcon className="mr-2 size-4" />
          Add Rule
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Field Key</TableHead>
              <TableHead>Required</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeRules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>{stageMap[rule.stageKey] ?? rule.stageKey}</TableCell>
                <TableCell className="capitalize">{rule.entityType}</TableCell>
                <TableCell>
                  <code className="text-sm">{rule.fieldKey}</code>
                </TableCell>
                <TableCell>
                  {rule.required ? (
                    <Badge variant="default">Required</Badge>
                  ) : (
                    <Badge variant="outline">Optional</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(rule)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Rule" : "Add Rule"}</DialogTitle>
            <DialogDescription>
              Define which fields are mandatory to advance to a stage.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="stageKey">Stage</Label>
              <Select
                value={form.watch("stageKey") || undefined}
                onValueChange={(v) => form.setValue("stageKey", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages
                    .filter((s) => s.active)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="entityType">Entity Type</Label>
              <Select
                value={form.watch("entityType")}
                onValueChange={(v) =>
                  form.setValue("entityType", v as StageGateRule["entityType"])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {stageGateRuleEntityTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fieldKey">Field Key</Label>
              <Input
                id="fieldKey"
                {...form.register("fieldKey")}
                placeholder="e.g. execution_date"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="required"
                checked={form.watch("required")}
                onCheckedChange={(v) => form.setValue("required", !!v)}
              />
              <Label htmlFor="required">Required</Label>
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SalesProcessConfigClient({
  pipelineStages,
  lossReasons,
  projectTypes,
  revenueCategories,
  stageGateRules,
}: SalesProcessConfigClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Process Configuration</h1>
        <p className="text-muted-foreground">
          Manage pipeline stages, loss reasons, project types, revenue categories, and stage-gate rules.
        </p>
      </div>

      <Tabs defaultValue="pipeline-stages">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTab value="pipeline-stages">Pipeline Stages</TabsTab>
          <TabsTab value="loss-reasons">Loss Reasons</TabsTab>
          <TabsTab value="project-types">Project Types</TabsTab>
          <TabsTab value="revenue-categories">Revenue Categories</TabsTab>
          <TabsTab value="stage-gate-rules">Stage-Gate Rules</TabsTab>
        </TabsList>

        <TabsPanel value="pipeline-stages">
          <PipelineStagesTab stages={pipelineStages} />
        </TabsPanel>

        <TabsPanel value="loss-reasons">
          <LossReasonsTab reasons={lossReasons} />
        </TabsPanel>

        <TabsPanel value="project-types">
          <ProjectTypesTab types={projectTypes} />
        </TabsPanel>

        <TabsPanel value="revenue-categories">
          <RevenueCategoriesTab categories={revenueCategories} />
        </TabsPanel>

        <TabsPanel value="stage-gate-rules">
          <StageGateRulesTab rules={stageGateRules} stages={pipelineStages} />
        </TabsPanel>
      </Tabs>
    </div>
  )
}
