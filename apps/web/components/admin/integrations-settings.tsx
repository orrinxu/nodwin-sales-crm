"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface EntitySummary {
  id: string
  name: string
}

interface DriveConfigRecord {
  id: string | null
  entityId: string
  accountsParentFolderId: string | null
  opportunitiesParentFolderId: string | null
  pnlParentFolderId: string | null
}

interface IntegrationsSettingsProps {
  entities: EntitySummary[]
  driveConfigs: DriveConfigRecord[]
  updateDriveConfigAction: (input: {
    entityId: string
    accountsParentFolderId?: string | null
    opportunitiesParentFolderId?: string | null
    pnlParentFolderId?: string | null
  }) => Promise<void>
}

interface EntityDriveConfig {
  entityId: string
  entityName: string
  accountsParentFolderId: string
  opportunitiesParentFolderId: string
  pnlParentFolderId: string
}

export function IntegrationsSettings({
  entities,
  driveConfigs,
  updateDriveConfigAction,
}: IntegrationsSettingsProps) {
  const router = useRouter()

  const configMap = new Map(driveConfigs.map((c) => [c.entityId, c]))

  const initialRows: EntityDriveConfig[] = entities.map((e) => {
    const cfg = configMap.get(e.id)
    return {
      entityId: e.id,
      entityName: e.name,
      accountsParentFolderId: cfg?.accountsParentFolderId ?? "",
      opportunitiesParentFolderId: cfg?.opportunitiesParentFolderId ?? "",
      pnlParentFolderId: cfg?.pnlParentFolderId ?? "",
    }
  })

  const [rows, setRows] = useState<EntityDriveConfig[]>(initialRows)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const handleFieldChange = useCallback(
    (entityId: string, field: keyof EntityDriveConfig, value: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.entityId === entityId ? { ...r, [field]: value } : r,
        ),
      )
      setSaved((prev) => ({ ...prev, [entityId]: false }))
    },
    [],
  )

  const handleSave = useCallback(
    async (entityId: string) => {
      const row = rows.find((r) => r.entityId === entityId)
      if (!row) return

      setSaving((prev) => ({ ...prev, [entityId]: true }))
      setSaved((prev) => ({ ...prev, [entityId]: false }))

      try {
        await updateDriveConfigAction({
          entityId,
          accountsParentFolderId: row.accountsParentFolderId || null,
          opportunitiesParentFolderId: row.opportunitiesParentFolderId || null,
          pnlParentFolderId: row.pnlParentFolderId || null,
        })
        setSaved((prev) => ({ ...prev, [entityId]: true }))
        router.refresh()
      } catch {
        // handled by caller
      } finally {
        setSaving((prev) => ({ ...prev, [entityId]: false }))
      }
    },
    [rows, updateDriveConfigAction, router],
  )

  const renderDriveRow = (row: EntityDriveConfig) => {
    const isPending = saving[row.entityId] ?? false
    const isSaved = saved[row.entityId] ?? false

    return (
      <div key={row.entityId} className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">{row.entityName}</h3>
          <div className="flex items-center gap-3">
            {isSaved && (
              <span className="text-sm text-green-600">Saved.</span>
            )}
            <Button size="sm" onClick={() => handleSave(row.entityId)} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`accounts-${row.entityId}`}>Accounts Folder ID</Label>
            <Input
              id={`accounts-${row.entityId}`}
              value={row.accountsParentFolderId}
              onChange={(e) =>
                handleFieldChange(row.entityId, "accountsParentFolderId", e.target.value)
              }
              placeholder="1abc..."
            />
            <p className="text-xs text-muted-foreground">
              Google Drive folder for account documents.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`opportunities-${row.entityId}`}>
              Opportunities Folder ID
            </Label>
            <Input
              id={`opportunities-${row.entityId}`}
              value={row.opportunitiesParentFolderId}
              onChange={(e) =>
                handleFieldChange(row.entityId, "opportunitiesParentFolderId", e.target.value)
              }
              placeholder="1abc..."
            />
            <p className="text-xs text-muted-foreground">
              Google Drive folder for opportunity documents.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`pnl-${row.entityId}`}>P&amp;L Folder ID</Label>
            <Input
              id={`pnl-${row.entityId}`}
              value={row.pnlParentFolderId}
              onChange={(e) =>
                handleFieldChange(row.entityId, "pnlParentFolderId", e.target.value)
              }
              placeholder="1abc..."
            />
            <p className="text-xs text-muted-foreground">
              Google Drive folder for P&amp;L spreadsheets.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Integrations
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Configure Google Drive folders, Slack, email, and AI provider
            settings.
          </p>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* ═══ Google Drive ═══ */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Google Drive</h2>
            <p className="text-sm text-muted-foreground">
              Configure per-entity parent folder IDs for auto-created Drive
              folders. Leave blank to skip automatic folder creation for that
              entity and type.
            </p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No entities found. Create entities first before configuring
                Drive folders.
              </p>
            ) : (
              <div className="space-y-4">{rows.map(renderDriveRow)}</div>
            )}
          </div>

          {/* ═══ Slack ═══ */}
          <div className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-medium">Slack</h2>
            <p className="text-sm text-muted-foreground">
              Slack workspace integration is coming in a future release.
              Notifications for stage advances, deal closures, and approval
              requests will be configurable here.
            </p>
          </div>

          {/* ═══ Email ═══ */}
          <div className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-medium">Email</h2>
            <p className="text-sm text-muted-foreground">
              Outbound email (Resend / Postmark) and inbound email (Postmark
              Inbound) configuration will be available here. For now, email
              provider settings are managed via environment variables.
            </p>
          </div>

          {/* ═══ AI Providers ═══ */}
          <div className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-medium">AI Providers</h2>
            <p className="text-sm text-muted-foreground">
              AI provider configuration (Anthropic, Gemini, DeepSeek, Moonshot,
              Ollama) and per-feature provider preferences will be manageable
              from this section in a future release.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
