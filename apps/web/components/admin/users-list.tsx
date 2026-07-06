"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
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
import type { AdminUserRecord, UserRole } from "@/lib/data/users.types"
import { USER_ROLES } from "@/lib/data/users.types"

const NONE = "__none__"

const ROLE_LABELS: Record<UserRole, string> = {
  sales_rep: "Sales Rep",
  sales_manager: "Sales Manager",
  regional_head: "Regional Head",
  group_sales_lead: "Group Sales Lead",
  finance: "Finance",
  ops: "Ops",
  entity_admin: "Entity Admin",
  admin: "Admin",
  exec: "Exec",
  external_partner: "External Partner",
}

function roleLabel(role: UserRole): string {
  // eslint-disable-next-line security/detect-object-injection -- role is a constrained union, not user input
  return ROLE_LABELS[role]
}

interface Option {
  id: string
  name: string
}

interface UsersListProps {
  users: AdminUserRecord[]
  currentUserId: string
  // Super Admin only: role / manager / entity assignment. Entity Admins may edit
  // name / business unit / status of their own entity's users.
  canManageRoles: boolean
  entities: Option[]
  businessUnits: Option[]
  updateAction: (userId: string, input: unknown) => Promise<void>
}

function EditUserDialog({
  user,
  isSelf,
  canManageRoles,
  entities,
  businessUnits,
  otherUsers,
  onOpenChange,
  updateAction,
}: {
  user: AdminUserRecord
  isSelf: boolean
  canManageRoles: boolean
  entities: Option[]
  businessUnits: Option[]
  otherUsers: { id: string; name: string }[]
  onOpenChange: (open: boolean) => void
  updateAction: UsersListProps["updateAction"]
}) {
  const router = useRouter()
  const [fullName, setFullName] = useState(user.fullName ?? "")
  const [role, setRole] = useState<UserRole>(user.role)
  const [entityId, setEntityId] = useState(user.primaryEntityId ?? NONE)
  const [buId, setBuId] = useState(user.primaryBusinessUnitId ?? NONE)
  const [managerId, setManagerId] = useState(user.managerUserId ?? NONE)
  const [active, setActive] = useState(user.active)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSave() {
    setPending(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim() || undefined,
        primaryBusinessUnitId: buId === NONE ? null : buId,
        active,
      }
      // Role / manager / entity are Super-Admin-only (and trigger-blocked for
      // Entity Admins) — don't submit them when the viewer can't manage them.
      if (canManageRoles) {
        payload.role = role
        payload.primaryEntityId = entityId === NONE ? null : entityId
        payload.managerUserId = managerId === NONE ? null : managerId
      }
      await updateAction(user.id, payload)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)} disabled={!canManageRoles}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-[11px] text-muted-foreground">You can&rsquo;t remove your own admin role.</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Manager</Label>
              <Select value={managerId} onValueChange={(v) => setManagerId(v ?? NONE)} disabled={!canManageRoles}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {otherUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Entity</Label>
              <Select value={entityId} onValueChange={(v) => setEntityId(v ?? NONE)} disabled={!canManageRoles}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Business unit</Label>
              <Select value={buId} onValueChange={(v) => setBuId(v ?? NONE)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {businessUnits.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive users can&apos;t sign in and are hidden from features that check status.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} disabled={isSelf} aria-label="Active" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={onSave} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UsersList({ users, currentUserId, canManageRoles, entities, businessUnits, updateAction }: UsersListProps) {
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<AdminUserRecord | null>(null)

  const filtered = useMemo(() => {
    if (!query) return users
    const q = query.toLowerCase()
    return users.filter(
      (u) =>
        (u.fullName ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        roleLabel(u.role).toLowerCase().includes(q),
    )
  }, [users, query])

  const otherUsers = useMemo(
    () => users.filter((u) => u.id !== editing?.id).map((u) => ({ id: u.id, name: u.fullName ?? u.email ?? u.id })),
    [users, editing],
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users &amp; Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage roles, entity affiliation, reporting line, and access. Users sign in with Google.
        </p>
      </div>

      <div className="relative sm:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search users…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.fullName ?? "—"}
                    {u.id === currentUserId && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{roleLabel(u.role)}</Badge></TableCell>
                  <TableCell>{u.primaryEntityName ?? "—"}</TableCell>
                  <TableCell>{u.managerName ?? "—"}</TableCell>
                  <TableCell>
                    {u.active ? <Badge variant="default">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={`Edit ${u.fullName ?? u.email}`}>
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card className="flex flex-1 items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No users match your search.</p>
        </Card>
      )}

      {editing && (
        <EditUserDialog
          user={editing}
          isSelf={editing.id === currentUserId}
          canManageRoles={canManageRoles}
          entities={entities}
          businessUnits={businessUnits}
          otherUsers={otherUsers}
          onOpenChange={(open) => { if (!open) setEditing(null) }}
          updateAction={updateAction}
        />
      )}
    </div>
  )
}
