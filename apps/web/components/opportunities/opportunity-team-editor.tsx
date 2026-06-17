"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import type {
  OpportunityTeamMember,
  OpportunityTeamMemberInput,
  UserOption,
} from "@/lib/data/opportunities.types"

const TEAM_ROLES = ["owner", "contributor", "viewer", "approver"] as const

interface OpportunityTeamEditorProps {
  members: OpportunityTeamMember[]
  users: UserOption[]
  onSave: (members: OpportunityTeamMemberInput[]) => Promise<void>
}

export function OpportunityTeamEditor({
  members,
  users,
  onSave,
}: OpportunityTeamEditorProps) {
  const [items, setItems] = useState<OpportunityTeamMemberInput[]>(
    () => members.map((m) => ({
      userId: m.userId,
      role: m.role as OpportunityTeamMemberInput["role"],
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addRow() {
    setItems((prev) => [
      ...prev,
      { userId: "", role: "viewer" },
    ])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRow(
    index: number,
    field: keyof OpportunityTeamMemberInput,
    value: string,
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const validItems = items.filter((item) => item.userId)
      await onSave(validItems)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save team members")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team members added.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
            >
              <div className="grid min-w-[200px] flex-1 gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  User
                </label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={item.userId}
                  onChange={(e) => updateRow(index, "userId", e.target.value)}
                >
                  <option value="">Select user</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Role
                </label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={item.role}
                  onChange={(e) => updateRow(index, "role", e.target.value)}
                >
                  {TEAM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => removeRow(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} member{items.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
          >
            <Plus className="size-4" />
            Add Member
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Team"}
          </Button>
        </div>
      </div>
    </div>
  )
}
