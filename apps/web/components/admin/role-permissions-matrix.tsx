"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
import { PERMISSIONS, PERMISSION_CATEGORIES } from "@/lib/data/permissions"
import type { RoleRecord, RolePermissionRow } from "@/lib/data/roles"
import {
  buildRoleMatrix,
  togglePermission,
  dirtyRoleIds,
  type RoleMatrix,
} from "./role-matrix"

interface RolePermissionsMatrixProps {
  roles: RoleRecord[]
  rolePermissions: RolePermissionRow[]
  setPermissionsAction: (input: {
    roleId: string
    permissionKeys: string[]
  }) => Promise<void>
}

/**
 * Role × permission grid. Permissions (grouped by category) are rows; roles are
 * columns; each cell is a Switch. The Super Admin column is read-only/all-on
 * because it bypasses the matrix at the DB level (has_permission short-circuits
 * `admin`) — shown so admins aren't confused into thinking it's editable.
 */
export function RolePermissionsMatrix({
  roles,
  rolePermissions,
  setPermissionsAction,
}: RolePermissionsMatrixProps) {
  const router = useRouter()
  const roleIds = useMemo(() => roles.map((r) => r.id), [roles])
  const baseline = useMemo(
    () => buildRoleMatrix(rolePermissions, roleIds),
    [rolePermissions, roleIds],
  )
  const [matrix, setMatrix] = useState<RoleMatrix>(baseline)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = useMemo(() => dirtyRoleIds(baseline, matrix), [baseline, matrix])

  const isReadOnly = (role: RoleRecord) => role.key === "admin"

  const cellChecked = (role: RoleRecord, key: string) =>
    isReadOnly(role) ? true : (matrix.get(role.id)?.has(key) ?? false)

  function onToggle(roleId: string, key: string) {
    setMatrix((m) => togglePermission(m, roleId, key))
  }

  async function onSave() {
    setSaving(true)
    setError(null)
    try {
      for (const roleId of dirty) {
        await setPermissionsAction({
          roleId,
          permissionKeys: [...(matrix.get(roleId) ?? [])],
        })
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save permissions.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Permissions</h2>
          <p className="text-sm text-muted-foreground">
            Toggle what each role can do. Super Admin always has every permission.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error ? <span className="text-sm text-destructive">{error}</span> : null}
          {dirty.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {dirty.length} role{dirty.length === 1 ? "" : "s"} changed
            </span>
          ) : null}
          <Button size="sm" onClick={onSave} disabled={saving || dirty.length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  className="min-w-24 px-3 py-2 text-center align-bottom font-medium"
                >
                  <div className="truncate">{role.label}</div>
                  {isReadOnly(role) ? (
                    <div className="text-caption font-normal text-muted-foreground">
                      all
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_CATEGORIES.map((category) => (
              <CategoryRows
                key={category}
                category={category}
                roles={roles}
                colSpan={roles.length + 1}
                cellChecked={cellChecked}
                isReadOnly={isReadOnly}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function CategoryRows({
  category,
  roles,
  colSpan,
  cellChecked,
  isReadOnly,
  onToggle,
}: {
  category: string
  roles: RoleRecord[]
  colSpan: number
  cellChecked: (role: RoleRecord, key: string) => boolean
  isReadOnly: (role: RoleRecord) => boolean
  onToggle: (roleId: string, key: string) => void
}) {
  const perms = PERMISSIONS.filter((p) => p.category === category)
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td
          colSpan={colSpan}
          className="sticky left-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {category}
        </td>
      </tr>
      {perms.map((perm) => (
        <tr key={perm.key} className="border-b last:border-0 hover:bg-muted/30">
          <td className="sticky left-0 z-10 bg-card px-4 py-2">
            <div className="font-medium">{perm.label}</div>
            <div className="text-caption text-muted-foreground">{perm.description}</div>
          </td>
          {roles.map((role) => (
            <td key={role.id} className="px-3 py-2 text-center">
              <Switch
                checked={cellChecked(role, perm.key)}
                disabled={isReadOnly(role)}
                onCheckedChange={() => onToggle(role.id, perm.key)}
                aria-label={`${role.label}: ${perm.label}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
