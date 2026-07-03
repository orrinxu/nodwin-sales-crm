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
import { APPROVER_ROLE_OPTIONS, WORKFLOW_ENTITY_TYPES } from "@/lib/data/approval-workflows.types"

interface Option {
  id: string
  name: string
}

interface StepDraft {
  kind: "role" | "user"
  approverRole: string
  approverUserId: string
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
  const [steps, setSteps] = useState<StepDraft[]>([])

  const userName = (id: string) => userOptions.find((u) => u.id === id)?.name ?? "Unknown user"

  function stepLabel(workflow: AdminApprovalWorkflow): string {
    if (workflow.steps.length === 0) return "No steps (auto-approves)"
    return workflow.steps
      .map((s) => s.approverName ?? (s.approverRole ? titleCase(s.approverRole) : "?"))
      .join(" → ")
  }

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setEntityId("")
    setEntityType("opportunity")
    setActive(true)
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
    setSteps(
      w.steps.map((s) => ({
        kind: s.approverUserId ? "user" : "role",
        approverRole: s.approverRole ?? "",
        approverUserId: s.approverUserId ?? "",
      })),
    )
    setError(null)
    setOpen(true)
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }
  function addStep() {
    setSteps((prev) => [...prev, { kind: "role", approverRole: "sales_manager", approverUserId: "" }])
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

  async function handleSave() {
    if (name.trim() === "") {
      setError("Name is required")
      return
    }
    // Drop incomplete steps (no approver chosen).
    const cleanSteps = steps
      .filter((s) => (s.kind === "role" ? s.approverRole : s.approverUserId))
      .map((s, i) => ({
        stepOrder: i + 1,
        approverRole: s.kind === "role" ? s.approverRole : null,
        approverUserId: s.kind === "user" ? s.approverUserId : null,
      }))

    setPending(true)
    setError(null)
    try {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        entityType,
        entityId: entityId || null,
        active,
      }
      if (editing) {
        await updateAction(editing.id, input)
        // The steps replace is self-atomic; a failure leaves prior steps intact.
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
                    <Badge variant="secondary" className="text-xs">{w.entityType}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {w.entityName ?? "Org-wide default"}
                    </Badge>
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

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>

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
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <select
                    className={SELECT_CLASS}
                    value={s.kind}
                    onChange={(e) => updateStep(i, { kind: e.target.value as "role" | "user" })}
                    aria-label={`Step ${i + 1} approver type`}
                  >
                    <option value="role">By role</option>
                    <option value="user">Specific user</option>
                  </select>
                  {s.kind === "role" ? (
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
                  ) : (
                    <select
                      className={`${SELECT_CLASS} flex-1`}
                      value={s.approverUserId}
                      onChange={(e) => updateStep(i, { approverUserId: e.target.value })}
                      aria-label={`Step ${i + 1} user`}
                    >
                      <option value="">Select user...</option>
                      {userOptions.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  )}
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
