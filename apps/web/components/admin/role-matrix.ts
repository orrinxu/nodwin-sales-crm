import type { RolePermissionRow } from "@/lib/data/roles"

/**
 * Pure helpers for the role × permission matrix editor — kept separate from the
 * component so the grid logic is unit-testable.
 *
 * The matrix is a `Map<roleId, Set<permissionKey>>` (a Map, not a plain object,
 * to avoid dynamic-key object-injection). Every provided roleId gets an entry
 * (empty set if it holds nothing) so the UI can render a full grid.
 */

export type RoleMatrix = Map<string, Set<string>>

export function buildRoleMatrix(
  rows: RolePermissionRow[],
  roleIds: string[],
): RoleMatrix {
  const matrix: RoleMatrix = new Map()
  for (const id of roleIds) matrix.set(id, new Set())
  for (const row of rows) {
    const set = matrix.get(row.roleId) ?? new Set<string>()
    set.add(row.permissionKey)
    matrix.set(row.roleId, set)
  }
  return matrix
}

/** Immutable toggle of one cell; returns a new matrix. */
export function togglePermission(
  matrix: RoleMatrix,
  roleId: string,
  key: string,
): RoleMatrix {
  const next = new Map(matrix)
  const set = new Set(next.get(roleId) ?? [])
  if (set.has(key)) set.delete(key)
  else set.add(key)
  next.set(roleId, set)
  return next
}

/** Role ids whose permission set differs from the baseline (need saving). */
export function dirtyRoleIds(baseline: RoleMatrix, current: RoleMatrix): string[] {
  const ids = new Set([...baseline.keys(), ...current.keys()])
  const dirty: string[] = []
  for (const id of ids) {
    if (!setsEqual(baseline.get(id) ?? new Set(), current.get(id) ?? new Set())) {
      dirty.push(id)
    }
  }
  return dirty
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
