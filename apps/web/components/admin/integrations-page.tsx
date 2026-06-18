"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Loader2 } from "lucide-react"
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EntityRecord } from "@/lib/data/entities"
import type {
  IntegrationSettingRecord,
  DriveConfigRecord,
  ConnectionHealthRecord,
} from "@/lib/data/integrations"

interface IntegrationsPageProps {
  settings: IntegrationSettingRecord[]
  driveConfig: DriveConfigRecord[]
  health: ConnectionHealthRecord[]
  entities: EntityRecord[]
  updateSettingAction: (input: unknown) => Promise<IntegrationSettingRecord>
  updateDriveConfigAction: (input: unknown) => Promise<DriveConfigRecord>
}

function getHealthBadge(status: string) {
  if (!status || status === "unknown") {
    return <Badge variant="outline">Unknown</Badge>
  }
  if (status === "healthy") {
    return <Badge variant="default">Connected</Badge>
  }
  if (status === "degraded") {
    return <Badge variant="secondary">Degraded</Badge>
  }
  return <Badge variant="destructive">Error</Badge>
}

function getSettingForProvider(
  settings: IntegrationSettingRecord[],
  provider: string,
) {
  return settings.find((s) => s.provider === provider) ?? null
}

function getHealthForProvider(
  health: ConnectionHealthRecord[],
  provider: string,
) {
  return health.find((h) => h.provider === provider) ?? null
}

function GoogleWorkspaceSection({
  settings,
  driveConfig,
  health,
  entities,
  updateSettingAction,
  updateDriveConfigAction,
}: IntegrationsPageProps) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [driveSaving, setDriveSaving] = useState<string | null>(null)
  const [driveEditing, setDriveEditing] = useState<Record<string, Record<string, string>>>({})

  const gmailSetting = getSettingForProvider(settings, "gmail")
  const sheetsSetting = getSettingForProvider(settings, "google_sheets")
  const docsSetting = getSettingForProvider(settings, "google_docs")
  const slidesSetting = getSettingForProvider(settings, "google_slides")
  const driveHealth = getHealthForProvider(health, "gmail")

  async function handleToggle(setting: IntegrationSettingRecord, enabled: boolean) {
    setSaving(setting.id)
    try {
      await updateSettingAction({
        id: setting.id,
        enabled,
      })
      router.refresh()
    } finally {
      setSaving(null)
    }
  }

  async function handleDriveSave(config: DriveConfigRecord) {
    setDriveSaving(config.id)
    try {
      const edits = driveEditing[config.id] ?? {}
      await updateDriveConfigAction({
        id: config.id,
        ...edits,
      })
      setDriveSaving(null)
      router.refresh()
    } catch {
      setDriveSaving(null)
    }
  }

  function handleDriveFieldChange(
    configId: string,
    field: string,
    value: string,
  ) {
    setDriveEditing((prev) => ({
      ...prev,
      // eslint-disable-next-line security/detect-object-injection -- configId is a UUID from DB
      [configId]: { ...(prev[configId] ?? {}), [field]: value },
    }))
  }

  function getEntityName(entityId: string) {
    return entities.find((e) => e.id === entityId)?.name ?? entityId
  }

  const providerToggles = [
    { label: "Gmail sync", setting: gmailSetting, provider: "gmail" },
    { label: "Google Sheets", setting: sheetsSetting, provider: "google_sheets" },
    { label: "Google Docs", setting: docsSetting, provider: "google_docs" },
    { label: "Google Slides", setting: slidesSetting, provider: "google_slides" },
  ]

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium">Connection Status</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Google Workspace:</span>
          {getHealthBadge(driveHealth?.healthStatus ?? "unknown")}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Service Access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enable or disable Google Workspace service integrations per entity.
        </p>
        <div className="mt-4 space-y-3">
          {providerToggles.map(({ label, setting, provider }) => (
            <div key={provider} className="flex items-center justify-between rounded-lg border px-4 py-3">
              <span className="text-sm font-medium">{label}</span>
              <span className="flex items-center gap-2">
                {saving === (setting?.id ?? null) && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                <Checkbox
                  checked={setting?.enabled ?? false}
                  disabled={!setting || saving === setting.id}
                  onCheckedChange={(checked) => {
                    if (setting) handleToggle(setting, !!checked)
                  }}
                />
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Drive Folder Configuration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure Google Drive folder IDs for each entity.
        </p>
        <div className="mt-4 overflow-x-auto">
          {driveConfig.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead>Opportunities</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Gmail</TableHead>
                  <TableHead>Sheets</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead>Slides</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driveConfig.map((dc) => {
                  const edits = driveEditing[dc.id] ?? {}
                  const hasChanges = Object.keys(edits).length > 0
                  return (
                    <TableRow key={dc.id}>
                      <TableCell className="font-medium">{getEntityName(dc.entityId)}</TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.accountsParentFolderId ?? dc.accountsParentFolderId ?? ""}
                          onChange={(e) => handleDriveFieldChange(dc.id, "accountsParentFolderId", e.target.value)}
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.opportunitiesParentFolderId ?? dc.opportunitiesParentFolderId ?? ""}
                          onChange={(e) => handleDriveFieldChange(dc.id, "opportunitiesParentFolderId", e.target.value)}
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.pnlParentFolderId ?? dc.pnlParentFolderId ?? ""}
                          onChange={(e) => handleDriveFieldChange(dc.id, "pnlParentFolderId", e.target.value)}
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.gmailParentFolderId ?? dc.gmailParentFolderId ?? ""}
                          onChange={(e) => handleDriveFieldChange(dc.id, "gmailParentFolderId", e.target.value)}
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.sheetsParentFolderId ?? dc.sheetsParentFolderId ?? ""}
                          onChange={(e) => handleDriveFieldChange(dc.id, "sheetsParentFolderId", e.target.value)}
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.docsParentFolderId ?? dc.docsParentFolderId ?? ""}
                          onChange={(e) => handleDriveFieldChange(dc.id, "docsParentFolderId", e.target.value)}
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.slidesParentFolderId ?? dc.slidesParentFolderId ?? ""}
                          onChange={(e) => handleDriveFieldChange(dc.id, "slidesParentFolderId", e.target.value)}
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        {hasChanges && (
                          <Button
                            variant="default"
                            size="sm"
                            disabled={driveSaving === dc.id}
                            onClick={() => handleDriveSave(dc)}
                          >
                            {driveSaving === dc.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No drive configurations found. Create entity records in Entities admin first.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function SlackSection({ settings, health }: IntegrationsPageProps) {
  const slackSetting = getSettingForProvider(settings, "slack")
  const slackHealth = getHealthForProvider(health, "slack")
  const workspace = (slackSetting?.config?.workspace as string) ?? "—"
  const channels = (slackSetting?.config?.channels as string[]) ?? []
  const events = [
    "deal_created",
    "deal_stage_changed",
    "deal_won",
    "deal_lost",
    "contact_added",
    "account_updated",
    "task_assigned",
  ] as const

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium">Connection Status</h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status:</span>
            {getHealthBadge(slackHealth?.healthStatus ?? "unknown")}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Workspace:</span>
            <span className="text-sm font-medium">{workspace}</span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Event Routing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure which events are sent to which Slack channels.
        </p>
        <div className="mt-4 overflow-x-auto">
          {channels.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  {channels.map((ch) => (
                    <TableHead key={ch}>#{ch}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const routing = (slackSetting?.config?.event_routing as Record<string, string[]>) ?? {}
                  // eslint-disable-next-line security/detect-object-injection -- event keys are typed const
                  const eventChannels = routing[event] ?? []
                  return (
                    <TableRow key={event}>
                      <TableCell className="font-medium">
                        {event.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </TableCell>
                      {channels.map((ch) => (
                        <TableCell key={ch}>
                          {eventChannels.includes(ch) ? (
                            <Check className="size-4 text-green-600" />
                          ) : (
                            <X className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Slack channels configured. Channels are managed via config.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function EmailSection({ settings, health }: IntegrationsPageProps) {
  const resendSetting = getSettingForProvider(settings, "resend")
  const resendHealth = getHealthForProvider(health, "resend")
  const domain = (resendSetting?.config?.domain as string) ?? "—"
  const inboundDomain = (resendSetting?.config?.inbound_domain as string) ?? "—"
  const templates = (resendSetting?.config?.templates as Array<{ name: string; id: string }>) ?? []

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium">Resend Configuration</h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status:</span>
            {getHealthBadge(resendHealth?.healthStatus ?? "unknown")}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Domain:</span>
            <span className="text-sm font-medium">{domain}</span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Inbound Email</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Inbound Domain:</span>
          <span className="text-sm font-medium font-mono">{inboundDomain}</span>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Transactional Templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Email templates configured in Resend.
        </p>
        <div className="mt-4">
          {templates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Template ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-sm">{t.id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No transactional templates configured.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function SalesforceSection({ settings, health }: IntegrationsPageProps) {
  const sfSetting = getSettingForProvider(settings, "salesforce")
  const sfHealth = getHealthForProvider(health, "salesforce")
  const fieldMap = (sfSetting?.config?.field_map as string) ?? ""
  const importHistory = (sfSetting?.config?.import_history as Array<{
    id: string
    status: string
    progress: number
    timestamp: string
  }>) ?? []

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium">Connection Status</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Salesforce:</span>
          {getHealthBadge(sfHealth?.healthStatus ?? "unknown")}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Field Mapping</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only Salesforce field mapping configuration.
        </p>
        <div className="mt-4">
          {fieldMap ? (
            <pre className="overflow-auto rounded-lg border bg-muted/50 p-4 text-sm font-mono">
              {fieldMap}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              No field mapping configuration available.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Import History</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent Salesforce import runs.
        </p>
        <div className="mt-4">
          {importHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importHistory.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{run.timestamp}</TableCell>
                    <TableCell>
                      {run.status === "completed" ? (
                        <Badge variant="default">Completed</Badge>
                      ) : run.status === "failed" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <Badge variant="secondary">{run.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{run.progress}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No import runs yet.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

export function IntegrationsPage(props: IntegrationsPageProps) {
  const [tab, setTab] = useState("google")

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage external service integrations and connections.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTab value="google">Google Workspace</TabsTab>
          <TabsTab value="slack">Slack</TabsTab>
          <TabsTab value="email">Email</TabsTab>
          <TabsTab value="salesforce">Salesforce</TabsTab>
        </TabsList>

        <TabsPanel value="google">
          <GoogleWorkspaceSection {...props} />
        </TabsPanel>
        <TabsPanel value="slack">
          <SlackSection {...props} />
        </TabsPanel>
        <TabsPanel value="email">
          <EmailSection {...props} />
        </TabsPanel>
        <TabsPanel value="salesforce">
          <SalesforceSection {...props} />
        </TabsPanel>
      </Tabs>
    </div>
  )
}
