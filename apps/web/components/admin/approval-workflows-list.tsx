"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AdminApprovalWorkflow } from "@/lib/data/approval-workflows.types"
import {
  APPROVER_ROLE_OPTIONS,
  WORKFLOW_ENTITY_TYPES,
  DEAL_STAGE_OPTIONS,
  APPROVAL_STEP_MODE_OPTIONS,
} from "@/lib/data/approval-workflows.types"
import type { ApprovalStepMode } from "@/lib/data/approval-workflows.types"

interface Option {
  id: string
  name: string
}

interface StepDraft {
  kind: "manager" | "role" | "user"
  approverRole: string
  approverUserId: string
  approverUserIds: string[]
  name: string
  mode: ApprovalStepMode
}

interface ApprovalWorkflowsListProps {
  workflows: AdminApprovalWorkflow[]
  entityOptions: Option[]
  userOptions: Option[]
  createAction: (input: unknown) => Promise<string>
  updateAction: (id: string, input: unknown) => Promise<void>
  deleteAction: (id: string) => Promise<void>
  replaceStepsAction: (workflowId: string, input: unknown) => Promise<void>
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function ApprovalWorkflowsList({
  workflows,
  entityOptions,
  userOptions,
  createAction,
  updateAction,
  deleteAction,
  replaceStepsAction,
}: ApprovalWorkflowsListProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdminApprovalWorkflow | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminApprovalWorkflow | null>(null)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [entityId, setEntityId] = useState("")
  const [entityType, setEntityType] = useState<string>("opportunity")
  const [active, setActive] = useState(true)
  const [appliesToEntityId, setAppliesToEntityId] = useState("")
  const [triggerStage, setTriggerStage] = useState("")
  const [enforceGate, setEnforceGate] = useState(false)
  const [steps, setSteps] = useState<StepDraft[]>([])

  function stepApproverLabel(s: {
    approverKind: string
    approverName: string | null
    approverRole: string | null
    approverUserIds: string[] | null
    name: string | null
  }): string {
    const label = s.name ?? null
    if (s.approverKind === "manager") return label ? `${label} (Manager)` : "Submitter's manager"
    if (s.approverKind === "user") {
      if (s.approverUserIds && s.approverUserIds.length > 1) {
        const count = s.approverUserIds.length
        const base = s.approverName ?? `${count} users`
        return label ? `${label} (${base})` : base
      }
      const base = s.approverName ?? "Specific user"
      return label ? `${label} (${base})` : base
    }
    const base = s.approverRole ? titleCase(s.approverRole) : "?"
    return label ? `${label} (${base})` : base
  }

  function stepLabel(workflow: AdminApprovalWorkflow): string {
    if (workflow.steps.length === 0) return "No steps (auto-approves)"
    return workflow.steps.map(stepApproverLabel).join(" → ")
  }

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setEntityId("")
    setEntityType("opportunity")
    setActive(true)
    setAppliesToEntityId("")
    setTriggerStage("")
    setEnforceGate(false)
    setSteps([])
    setError(null)
    setOpen(true)
  }

  function openEdit(w: AdminApprovalWorkflow) {
    setEditing(w)
    setName(w.name)
    setDescription(w.description ?? "")
    setEntityId(w.entityId ?? "")
    setEntityType(w.entityType)
    setActive(w.active)
    setAppliesToEntityId(w.appliesToEntityId ?? "")
    setTriggerStage(w.triggerStage ?? "")
    setEnforceGate(w.enforceGate)
    setSteps(
      w.steps.map((s) => ({
        kind: s.approverKind,
        approverRole: s.approverRole ?? "",
        approverUserId: s.approverUserId ?? "",
        approverUserIds: s.approverUserIds ?? [],
        name: s.name ?? "",
        mode: s.mode,
      })),
    )
    setError(null)
    setOpen(true)
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }
  function addStep() {
    setSteps((prev) => [
      ...prev,
      { kind: "manager", approverRole: "", approverUserId: "", approverUserIds: [], name: "", mode: "all_required" },
    ])
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }
  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }
  function toggleUser(index: number, userId: string) {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s
        const has = s.approverUserIds.includes(userId)
        return {
          ...s,
          approverUserIds: has
            ? s.approverUserIds.filter((id) => id !== userId)
            : [...s.approverUserIds, userId],
        }
      }),
    )
  }

  async function handleSave() {
    if (name.trim() === "") {
      setError("Name is required")
      return
    }
    const cleanSteps = steps
      .filter(
        (s) =>
          s.kind === "manager" ||
          (s.kind === "role" ? s.approverRole : s.approverUserIds.length > 0 || s.approverUserId),
      )
      .map((s, i) => {
        const hasMultiUser = s.approverUserIds.length > 1
        return {
          stepOrder: i + 1,
          approverKind: s.kind,
          approverRole: s.kind === "role" ? s.approverRole : null,
          approverUserId: s.kind === "user" && !hasMultiUser ? (s.approverUserId || s.approverUserIds[0] || null) : null,
          approverUserIds: s.kind === "user" && hasMultiUser ? s.approverUserIds : null,
          name: s.name.trim() || null,
          mode: s.approverUserIds.length > 1 ? s.mode : "all_required",
        }
      })

    setPending(true)
    setError(null)
    try {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        entityType,
        entityId: entityId || null,
        appliesToEntityId: appliesToEntityId || null,
        triggerStage: triggerStage || null,
        enforceGate,
        active,
      }
      if (editing) {
        await updateAction(editing.id, input)
        await replaceStepsAction(editing.id, { steps: cleanSteps })
      } else {
        // Create INACTIVE first, then add steps, then activate — so a mid-save
        // failure can't leave an active, step-less workflow (which would
        // auto-approve on submit). A partial failure leaves a harmless inactive row.
        const workflowId = await createAction({ ...input, active: false })
        await replaceStepsAction(workflowId, { steps: cleanSteps })
        if (active) await updateAction(workflowId, { active: true })
      }
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workflow")
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setPending(true)
    try {
      await deleteAction(deleteTarget.id)
      setDeleteTarget(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete workflow")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approval Workflows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the approval chain for each entity. Opportunities resolve their entity&apos;s
            workflow, falling back to the org-wide default.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New Workflow
        </Button>
      </div>

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No approval workflows yet. Create one to route approvals.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {workflows.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{w.name}</span>
                    <Badge variant="secondary" className="text-xs">{titleCase(w.entityType)}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {w.entityName ?? "Org-wide default"}
                    </Badge>
                    {w.triggerStage && (
                      <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                        {titleCase(w.triggerStage)}
                      </Badge>
                    )}
                    {w.enforceGate && (
                      <Badge variant="outline" className="text-xs border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                        Gate
                      </Badge>
                    )}
                    {!w.active && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{stepLabel(w)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(w)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Workflow" : "New Workflow"}</SheetTitle>
            <SheetDescription>
              Steps run in order; each must be approved before the next begins.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 px-4 py-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="wf-name">Name <span className="text-destructive">*</span></Label>
              <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nodwin India Opportunity Approval" />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wf-desc">Description</Label>
              <Input id="wf-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="wf-entity">Entity</Label>
                <select id="wf-entity" className={SELECT_CLASS} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                  <option value="">Org-wide default</option>
                  {entityOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wf-type">Applies to</Label>
                <select id="wf-type" className={SELECT_CLASS} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                  {WORKFLOW_ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>{titleCase(t)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="wf-sow-entity">Scope (SOW entity)</Label>
                <select id="wf-sow-entity" className={SELECT_CLASS} value={appliesToEntityId} onChange={(e) => setAppliesToEntityId(e.target.value)}>
                  <option value="">All entities</option>
                  {entityOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wf-trigger-stage">Trigger stage</Label>
                <select id="wf-trigger-stage" className={SELECT_CLASS} value={triggerStage} onChange={(e) => setTriggerStage(e.target.value)}>
                  <option value="">Manual only</option>
                  {DEAL_STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enforceGate} onChange={(e) => setEnforceGate(e.target.checked)} />
                <span>Enforce gate</span>
              </label>
            </div>

            {enforceGate && !triggerStage && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                An enforce-gate workflow should have a trigger stage so the gate can block stage
                transitions.
              </p>
            )}

            <div className="grid gap-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Approval Steps</Label>
                <Button type="button" variant="outline" size="sm" onClick={addStep}>
                  <Plus className="size-3.5" />
                  Add step
                </Button>
              </div>

              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No steps — this workflow auto-approves on submit.
                </p>
              )}

              {steps.map((s, i) => (
                <div key={i} className="rounded-lg border p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <select
                      className={SELECT_CLASS}
                      value={s.kind}
                      onChange={(e) => updateStep(i, { kind: e.target.value as "manager" | "role" | "user" })}
                      aria-label={`Step ${i + 1} approver type`}
                    >
                      <option value="manager">Submitter&apos;s manager</option>
                      <option value="role">By role</option>
                      <option value="user">Specific user(s)</option>
                    </select>
                    {s.kind === "manager" ? (
                      <span className="flex-1 text-xs text-muted-foreground">
                        Routed to the submitter&apos;s manager (falls back to an admin if none).
                      </span>
                    ) : s.kind === "role" ? (
                      <select
                        className={`${SELECT_CLASS} flex-1`}
                        value={s.approverRole}
                        onChange={(e) => updateStep(i, { approverRole: e.target.value })}
                        aria-label={`Step ${i + 1} role`}
                      >
                        <option value="">Select role...</option>
                        {APPROVER_ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{titleCase(r)}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>

                  {s.kind === "user" && (
                    <div className="ml-7 space-y-1.5">
                      <div className="border rounded-md max-h-32 overflow-y-auto p-1">
                        {userOptions.length === 0 && (
                          <p className="p-1 text-xs text-muted-foreground">No users available</p>
                        )}
                        {userOptions.map((u) => (
                          <label
                            key={u.id}
                            className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted text-xs cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={s.approverUserIds.includes(u.id)}
                              onChange={() => toggleUser(i, u.id)}
                            />
                            {u.name}
                          </label>
                        ))}
                      </div>
                      {s.approverUserIds.length > 1 && (
                        <select
                          className={SELECT_CLASS}
                          value={s.mode}
                          onChange={(e) => updateStep(i, { mode: e.target.value as ApprovalStepMode })}
                          aria-label={`Step ${i + 1} approval mode`}
                        >
                          {APPROVAL_STEP_MODE_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m === "any_one" ? "Any one can approve" : "All must approve"}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  <div className="ml-7 flex items-center gap-2">
                    <Input
                      className="h-7 text-xs"
                      value={s.name}
                      onChange={(e) => updateStep(i, { name: e.target.value })}
                      placeholder="Step label (optional)"
                      aria-label={`Step ${i + 1} label`}
                    />
                    <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move step ${i + 1} up`}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Move step ${i + 1} down`}>
                      <ArrowDown className="size-4" />
                    </button>
                    <button type="button" onClick={() => removeStep(i)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remove step ${i + 1}`}>
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={pending}>
              <Save className="size-4" />
              {pending ? "Saving..." : editing ? "Save Changes" : "Create Workflow"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deleteTarget?.name}&rdquo; and its steps? A workflow that has ever been
              used by an approval can&apos;t be deleted — set it <strong>inactive</strong> instead.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
