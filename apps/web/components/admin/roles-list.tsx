"use client"

import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { PlusIcon, PencilIcon, Trash2Icon, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { USER_ROLES } from "@/lib/data/users.types"
import type {
  RoleRecord,
  RoleCreateInput,
  RoleUpdateInput,
} from "@/lib/data/roles"

// Custom roles cannot base on the admin tiers (an admin-based role bypasses the
// permission matrix). Mirrors BASE_ROLE_OPTIONS in the server-only lib/data/roles.ts.
const BASE_ROLE_OPTIONS = USER_ROLES.filter(
  (r) => r !== "admin" && r !== "entity_admin",
)

const createFormSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Lowercase letters, numbers, and underscores only"),
  label: z.string().min(1, "Label is required").max(200),
  description: z.string().max(1000).optional().or(z.literal("")),
  baseRole: z.string().min(1, "Base role is required"),
})
type CreateFormData = z.infer<typeof createFormSchema>

const editFormSchema = z.object({
  label: z.string().min(1, "Label is required").max(200),
  description: z.string().max(1000).optional().or(z.literal("")),
})
type EditFormData = z.infer<typeof editFormSchema>

interface RolesListProps {
  roles: RoleRecord[]
  createAction: (input: RoleCreateInput) => Promise<RoleRecord>
  updateAction: (id: string, input: RoleUpdateInput) => Promise<void>
  deleteAction: (id: string) => Promise<void>
}

function useRoleLabeler(roles: RoleRecord[]) {
  return useMemo(() => {
    const byKey = new Map(roles.filter((r) => r.isSystem).map((r) => [r.key, r.label]))
    return (key: string) => byKey.get(key) ?? key.replace(/_/g, " ")
  }, [roles])
}

function CreateRoleDialog({
  createAction,
  roleLabel,
}: {
  createAction: RolesListProps["createAction"]
  roleLabel: (key: string) => string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema),
    defaultValues: { key: "", label: "", description: "", baseRole: "sales_rep" },
  })

  async function onSubmit(data: CreateFormData) {
    setPending(true)
    setError(null)
    try {
      await createAction({
        key: data.key,
        label: data.label,
        description: data.description || null,
        baseRole: data.baseRole,
      })
      form.reset()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create role.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>
        <PlusIcon className="h-4 w-4" />
        New role
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create role</DialogTitle>
            <DialogDescription>
              A custom role inherits its data access from a base role; toggle its
              capabilities in the permissions matrix below.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="role-key">
                Key <span className="text-destructive">*</span>
              </Label>
              <Input id="role-key" {...form.register("key")} placeholder="e.g. regional_finance" />
              {form.formState.errors.key && (
                <p className="text-xs text-destructive">{form.formState.errors.key.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role-label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input id="role-label" {...form.register("label")} placeholder="e.g. Regional Finance" />
              {form.formState.errors.label && (
                <p className="text-xs text-destructive">{form.formState.errors.label.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>
                Base role <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.watch("baseRole")}
                onValueChange={(v) => form.setValue("baseRole", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a base role" />
                </SelectTrigger>
                <SelectContent>
                  {BASE_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                Inherits this role&apos;s row-level data access (unchanged); permissions layer on top.
              </p>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="role-description">Description</Label>
              <Input id="role-description" {...form.register("description")} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditRoleDialog({
  role,
  open,
  onOpenChange,
  updateAction,
  roleLabel,
}: {
  role: RoleRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  updateAction: RolesListProps["updateAction"]
  roleLabel: (key: string) => string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { label: role.label, description: role.description ?? "" },
  })

  async function onSubmit(data: EditFormData) {
    setPending(true)
    setError(null)
    try {
      await updateAction(role.id, {
        label: data.label,
        description: data.description || null,
      })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl text-[15px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>Update &ldquo;{role.label}&rdquo;.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Key</Label>
              <p className="rounded-md bg-muted px-3 py-2 font-mono text-sm text-muted-foreground">
                {role.key}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Base role</Label>
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {roleLabel(role.baseRole)}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role-label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input id="edit-role-label" {...form.register("label")} />
              {form.formState.errors.label && (
                <p className="text-xs text-destructive">{form.formState.errors.label.message}</p>
              )}
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="edit-role-description">Description</Label>
              <Input id="edit-role-description" {...form.register("description")} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteRoleDialog({
  role,
  open,
  onOpenChange,
  deleteAction,
}: {
  role: RoleRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  deleteAction: RolesListProps["deleteAction"]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!role) return
    setPending(true)
    setError(null)
    try {
      await deleteAction(role.id)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete role</DialogTitle>
          <DialogDescription>
            Delete &ldquo;{role?.label}&rdquo;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RolesList({
  roles,
  createAction,
  updateAction,
  deleteAction,
}: RolesListProps) {
  const roleLabel = useRoleLabeler(roles)
  const [editing, setEditing] = useState<RoleRecord | null>(null)
  const [deleting, setDeleting] = useState<RoleRecord | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="size-6 text-primary" /> Roles &amp; Permissions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define roles and control what each can do. System roles mirror the built-in
            roles; create custom roles anchored to a base role.
          </p>
        </div>
        <CreateRoleDialog createAction={createAction} roleLabel={roleLabel} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Base role</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => {
              const canDelete = !role.isSystem && role.assignedUserCount === 0
              return (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.label}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {role.key}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {roleLabel(role.baseRole)}
                  </TableCell>
                  <TableCell>
                    {role.isSystem ? (
                      <Badge variant="outline">System</Badge>
                    ) : (
                      <Badge variant="default">Custom</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {role.assignedUserCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(role)}
                        aria-label={`Edit ${role.label}`}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!canDelete}
                        title={
                          role.isSystem
                            ? "System roles can't be deleted"
                            : role.assignedUserCount > 0
                              ? "Reassign users before deleting"
                              : undefined
                        }
                        onClick={() => setDeleting(role)}
                        aria-label={`Delete ${role.label}`}
                      >
                        <Trash2Icon className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EditRoleDialog
          role={editing}
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null) }}
          updateAction={updateAction}
          roleLabel={roleLabel}
        />
      )}
      <DeleteRoleDialog
        role={deleting}
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        deleteAction={deleteAction}
      />
    </div>
  )
}
