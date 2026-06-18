"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle } from "lucide-react"
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
  SlackConnectionRecord,
  EmailSettingsRecord,
  SalesforceConnectionRecord,
  DriveConfigRecord,
} from "@/lib/data/integrations"

interface IntegrationsPageProps {
  slackConnections: SlackConnectionRecord[]
  emailSettings: EmailSettingsRecord | null
  salesforceConnections: SalesforceConnectionRecord[]
  driveConfig: DriveConfigRecord[]
  entities: EntityRecord[]
  updateDriveConfigAction: (input: unknown) => Promise<DriveConfigRecord>
}

function statusBadge(status: string | null | undefined) {
  if (!status || status === "disconnected" || status === "inactive") {
    return <Badge variant="outline">Not Connected</Badge>
  }
  if (status === "connected" || status === "active") {
    return <Badge variant="default">Connected</Badge>
  }
  if (status === "connecting" || status === "importing") {
    return <Badge variant="secondary">Connecting</Badge>
  }
  if (status === "error") {
    return <Badge variant="destructive">Error</Badge>
  }
  return <Badge variant="outline">Unknown</Badge>
}

function GoogleWorkspaceSection({
  driveConfig,
  entities,
  updateDriveConfigAction,
}: Pick<IntegrationsPageProps, "driveConfig" | "entities" | "updateDriveConfigAction">) {
  const router = useRouter()
  const [driveSaving, setDriveSaving] = useState<string | null>(null)
  const [driveEditing, setDriveEditing] = useState<Record<string, Record<string, string>>>({})
  const [driveError, setDriveError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [toggleSaving, setToggleSaving] = useState<string | null>(null)

  function getEntityName(entityId: string) {
    return entities.find((e) => e.id === entityId)?.name ?? entityId
  }

  async function handleToggle(
    config: DriveConfigRecord,
    field: "gmailSyncEnabled" | "sheetsAccessEnabled" | "docsAccessEnabled" | "slidesAccessEnabled",
    enabled: boolean,
  ) {
    const savingKey = `${config.id}:${field}`
    setToggleSaving(savingKey)
    setToggleError(null)
    try {
      const payload: Record<string, unknown> = { id: config.id }
      // eslint-disable-next-line security/detect-object-injection -- field is a typed union literal
      payload[field] = enabled
      await updateDriveConfigAction(payload)
      router.refresh()
    } catch {
      setToggleError("Failed to toggle. Please try again.")
    } finally {
      setToggleSaving(null)
    }
  }

  async function handleDriveSave(config: DriveConfigRecord) {
    setDriveSaving(config.id)
    setDriveError(null)
    try {
      const edits = driveEditing[config.id] ?? {}
      await updateDriveConfigAction({
        id: config.id,
        ...edits,
      })
      setDriveEditing((prev) => {
        const next = { ...prev }
        delete next[config.id]
        return next
      })
      setDriveSaving(null)
      router.refresh()
    } catch {
      setDriveSaving(null)
      setDriveError("Failed to save drive config. Please try again.")
    }
  }

  function handleDriveFieldChange(configId: string, field: string, value: string) {
    setDriveEditing((prev) => ({
      ...prev,
      // eslint-disable-next-line security/detect-object-injection -- configId is a UUID from DB
      [configId]: { ...(prev[configId] ?? {}), [field]: value },
    }))
  }

  const toggleFields = [
    { key: "gmailSyncEnabled", label: "Gmail Sync" },
    { key: "sheetsAccessEnabled", label: "Sheets Access" },
    { key: "docsAccessEnabled", label: "Docs Access" },
    { key: "slidesAccessEnabled", label: "Slides Access" },
  ] as const

  return (
    <div className="space-y-6">
      {toggleError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {toggleError}
        </div>
      )}
      {driveError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {driveError}
        </div>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-medium">Connection Status</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Google Workspace:</span>
          {statusBadge(undefined)}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Per-Entity Configuration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure Google Drive folder IDs and service access per entity.
        </p>
        <div className="mt-4 overflow-x-auto">
          {driveConfig.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  {toggleFields.map((f) => (
                    <TableHead key={f.key}>{f.label}</TableHead>
                  ))}
                  <TableHead>Accounts Folder</TableHead>
                  <TableHead>Opportunities Folder</TableHead>
                  <TableHead>P&amp;L Folder</TableHead>
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
                      {toggleFields.map((f) => {
                        const savingKey = `${dc.id}:${f.key}`
                        const key = f.key
                        // eslint-disable-next-line security/detect-object-injection -- key is a typed property
                        const isEnabled = dc[key] as boolean
                        return (
                          <TableCell key={f.key}>
                            <span className="flex items-center gap-2">
                              {toggleSaving === savingKey && (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                              )}
                              <Checkbox
                                checked={isEnabled ?? false}
                                disabled={toggleSaving === savingKey}
                                onCheckedChange={(checked) =>
                                  handleToggle(dc, f.key, !!checked)
                                }
                              />
                            </span>
                          </TableCell>
                        )
                      })}
                      <TableCell>
                        <Input
                          className="w-36"
                          value={
                            edits.accountsParentFolderId ?? dc.accountsParentFolderId ?? ""
                          }
                          onChange={(e) =>
                            handleDriveFieldChange(dc.id, "accountsParentFolderId", e.target.value)
                          }
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={
                            edits.opportunitiesParentFolderId ??
                            dc.opportunitiesParentFolderId ??
                            ""
                          }
                          onChange={(e) =>
                            handleDriveFieldChange(
                              dc.id,
                              "opportunitiesParentFolderId",
                              e.target.value,
                            )
                          }
                          placeholder="Folder ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-36"
                          value={edits.pnlParentFolderId ?? dc.pnlParentFolderId ?? ""}
                          onChange={(e) =>
                            handleDriveFieldChange(dc.id, "pnlParentFolderId", e.target.value)
                          }
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

function SlackSection({
  slackConnections,
}: Pick<IntegrationsPageProps, "slackConnections">) {
  const connection = slackConnections[0] ?? null

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium">Connection Status</h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status:</span>
            {connection ? statusBadge(connection.status) : statusBadge(null)}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Workspace:</span>
            <span className="text-sm font-medium">
              {connection?.workspaceName ?? "\u2014"}
            </span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Event Routing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Event routing configuration from the Slack connection.
        </p>
        <div className="mt-4">
          {connection?.eventRouting && Object.keys(connection.eventRouting).length > 0 ? (
            <pre className="overflow-auto rounded-lg border bg-muted/50 p-4 text-sm font-mono">
              {JSON.stringify(connection.eventRouting, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              No event routing configured.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function EmailSection({
  emailSettings,
}: Pick<IntegrationsPageProps, "emailSettings">) {
  const settings = emailSettings
  const templates = (settings?.templateConfig as Record<string, unknown>) ?? {}

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium">Resend Configuration</h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status:</span>
            {settings ? statusBadge(settings.status) : statusBadge(null)}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Domain:</span>
            <span className="text-sm font-medium">{settings?.resendDomain ?? "\u2014"}</span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Inbound Email</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Inbound Domain:</span>
          <span className="text-sm font-medium font-mono">
            {settings?.inboundDomain ?? "\u2014"}
          </span>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Transactional Templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-template configuration stored in email settings.
        </p>
        <div className="mt-4">
          {Object.keys(templates).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template Name</TableHead>
                  <TableHead>Configuration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(templates).map(([name, config]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {typeof config === "object" ? JSON.stringify(config) : String(config)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No transactional template configuration found.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function SalesforceSection({
  salesforceConnections,
}: Pick<IntegrationsPageProps, "salesforceConnections">) {
  const connection = salesforceConnections[0] ?? null

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-medium">Connection Status</h2>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Salesforce:</span>
            {connection ? statusBadge(connection.importStatus) : statusBadge(null)}
          </div>
          {connection?.instanceUrl && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Instance URL:</span>
              <span className="text-sm font-medium font-mono">{connection.instanceUrl}</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-medium">Field Mapping</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only Salesforce field mapping configuration.
        </p>
        <div className="mt-4">
          {connection?.oauthState && Object.keys(connection.oauthState).length > 0 ? (
            <pre className="overflow-auto rounded-lg border bg-muted/50 p-4 text-sm font-mono">
              {JSON.stringify(connection.oauthState, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              No field mapping configuration available. Configure the sf_field_map.yaml to enable field mapping.
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
          {connection?.lastSyncAt ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{new Date(connection.lastSyncAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="default">Completed</Badge>
                  </TableCell>
                </TableRow>
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
          <GoogleWorkspaceSection
            driveConfig={props.driveConfig}
            entities={props.entities}
            updateDriveConfigAction={props.updateDriveConfigAction}
          />
        </TabsPanel>
        <TabsPanel value="slack">
          <SlackSection slackConnections={props.slackConnections} />
        </TabsPanel>
        <TabsPanel value="email">
          <EmailSection emailSettings={props.emailSettings} />
        </TabsPanel>
        <TabsPanel value="salesforce">
          <SalesforceSection salesforceConnections={props.salesforceConnections} />
        </TabsPanel>
      </Tabs>
    </div>
  )
}
