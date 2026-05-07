"use client"

import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
} from "@/components/ui/tabs"
import { DocumentList } from "@/components/opportunities/document-list"
import { DocumentUploadDialog } from "@/components/opportunities/document-upload-dialog"
import { RichTextDisplay } from "@/components/ui/rich-text-display"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import type { BusinessUnitOption } from "@/lib/data/opportunities.types"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { DocumentRecord } from "@/lib/data/documents.types"
import { DEAL_STAGES } from "@/lib/opportunity"
import { Money } from "@/lib/money"

interface OpportunityDetailWrapperProps {
  opportunity: OpportunityRecord
  businessUnits: BusinessUnitOption[]
  documents: DocumentRecord[]
  updateAction: (id: string, input: unknown) => Promise<OpportunityRecord>
  createDocumentAction: (opportunityId: string, input: unknown) => Promise<unknown>
}

export function OpportunityDetailWrapper({
  opportunity,
  businessUnits,
  documents,
  updateAction,
  createDocumentAction,
}: OpportunityDetailWrapperProps) {
  const router = useRouter()

  const stageIndex = Math.max(0, DEAL_STAGES.indexOf(opportunity.stage))

  const formattedAmount = Money.fromAmount(
    opportunity.amount,
    opportunity.currency,
  ).toDisplay()

  return (
    <div className="relative">
      <div className="absolute top-6 right-6 z-10">
        <OpportunityForm
          opportunity={opportunity}
          businessUnits={businessUnits}
          createAction={async () => { throw new Error("Not available") }}
          updateAction={updateAction}
          onSuccess={() => {
            router.refresh()
          }}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="size-4" />
              Edit
            </Button>
          }
        />
      </div>
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {opportunity.name}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex items-center rounded-md border bg-muted px-2.5 py-0.5 text-sm font-medium">
                {getStageLabel(opportunity.stage)}
              </span>
              <span className="text-sm text-muted-foreground">
                {opportunity.ownerName ?? "Unassigned"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1">
              {DEAL_STAGES.map((s, i) => (
                <div key={s} className="flex items-center">
                  <div
                    className={`size-2.5 rounded-full ${
                      i <= stageIndex
                        ? "bg-primary"
                        : "bg-muted-foreground/20"
                    }`}
                  />
                  {i < DEAL_STAGES.length - 1 && (
                    <div
                      className={`h-0.5 w-8 sm:w-12 ${
                        i < stageIndex
                          ? "bg-primary"
                          : "bg-muted-foreground/20"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
              <span>{getStageLabel(DEAL_STAGES[0])}</span>
              <span className="flex-1 text-right">
                {getStageLabel(DEAL_STAGES[DEAL_STAGES.length - 1])}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Amount</dt>
                  <dd className="text-sm font-medium">{formattedAmount}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Probability</dt>
                  <dd className="text-sm font-medium">
                    {opportunity.probabilityPct}%
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Currency</dt>
                  <dd className="text-sm font-medium">{opportunity.currency}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Close Date</dt>
                  <dd className="text-sm font-medium">
                    {opportunity.closeDate
                      ? new Date(opportunity.closeDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "\u2014"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Account</dt>
                  <dd className="text-sm font-medium">
                    {opportunity.accountName ?? "\u2014"}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Stage</dt>
                  <dd className="text-sm font-medium">
                    {getStageLabel(opportunity.stage)}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Owner</dt>
                  <dd className="text-sm font-medium">
                    {opportunity.ownerName ?? "\u2014"}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Sales Unit</dt>
                  <dd className="text-sm font-medium">
                    {businessUnits.find((b) => b.id === opportunity.salesUnitId)?.name ?? "\u2014"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {opportunity.description && (
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <RichTextDisplay html={opportunity.description} />
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="notes">
          <TabsList>
            <TabsTab value="stage-history">Stage History</TabsTab>
            <TabsTab value="notes">Notes</TabsTab>
            <TabsTab value="activity">Activity</TabsTab>
            <TabsTab value="call">Call</TabsTab>
            <TabsTab value="email">Email</TabsTab>
            <TabsTab value="files">Files</TabsTab>
            <TabsTab value="documents">Documents</TabsTab>
          </TabsList>

          <TabsPanel value="stage-history">
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  Stage history timeline coming in T-061.
                </p>
              </CardContent>
            </Card>
          </TabsPanel>

          <TabsPanel value="notes">
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  Notes coming in a future ticket.
                </p>
              </CardContent>
            </Card>
          </TabsPanel>

          <TabsPanel value="activity">
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  Activity timeline coming in a future ticket.
                </p>
              </CardContent>
            </Card>
          </TabsPanel>

          <TabsPanel value="call">
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  Call log coming in a future ticket.
                </p>
              </CardContent>
            </Card>
          </TabsPanel>

          <TabsPanel value="email">
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  Email thread coming in T-069–T-072.
                </p>
              </CardContent>
            </Card>
          </TabsPanel>

          <TabsPanel value="files">
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  File upload coming in T-081.
                </p>
              </CardContent>
            </Card>
          </TabsPanel>

          <TabsPanel value="documents">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Documents linked to this opportunity.
              </p>
              <DocumentUploadDialog
                opportunityId={opportunity.id}
                createAction={createDocumentAction}
              />
            </div>
            <DocumentList documents={documents} />
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  )
}
