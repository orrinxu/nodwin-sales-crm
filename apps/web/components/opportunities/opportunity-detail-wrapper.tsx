"use client"

import { useRouter } from "next/navigation"
import { Pencil, Repeat } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { ActivityTimeline } from "@/components/opportunities/activity-timeline"
import { ActivityComposer } from "@/components/opportunities/activity-composer"
import {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
} from "@/components/ui/tabs"
import type { OpportunityRecord, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { ActivityRecord } from "@/lib/data/activities"
import type { RevenueScheduleRow } from "@/lib/data/revenue-schedule"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { DEAL_STAGES } from "@/lib/opportunity"
import { Money } from "@/lib/money"

interface OpportunityDetailWrapperProps {
  opportunity: OpportunityRecord
  businessUnits: BusinessUnitOption[]
  updateAction: (id: string, input: unknown) => Promise<OpportunityRecord>
  activities: ActivityRecord[]
  createActivityAction: (opportunityId: string, input: unknown) => Promise<ActivityRecord>
  saveRevenueScheduleAction?: (opportunityId: string, input: unknown) => Promise<void>
  revenueSchedule?: RevenueScheduleRow[]
}

export function OpportunityDetailWrapper({
  opportunity,
  businessUnits,
  updateAction,
  activities,
  createActivityAction,
  saveRevenueScheduleAction,
  revenueSchedule = [],
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
          saveRevenueScheduleAction={saveRevenueScheduleAction}
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
              {opportunity.recurring && (
                <span className="inline-flex items-center gap-1 rounded-md border bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2.5 py-0.5 text-sm font-medium">
                  <Repeat className="size-3" />
                  Recurring
                </span>
              )}
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

        {opportunity.recurring && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Repeat className="size-4 text-muted-foreground" />
                <CardTitle>Recurring Revenue</CardTitle>
                <Badge variant="secondary" className="ml-auto">
                  {opportunity.recurringSplitKind === "custom" ? "Custom Split" : "Flat Split"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 mb-4">
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Service Start</dt>
                  <dd className="text-sm font-medium">
                    {opportunity.servicePeriodStart
                      ? new Date(opportunity.servicePeriodStart).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                      : "\u2014"}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Service End</dt>
                  <dd className="text-sm font-medium">
                    {opportunity.servicePeriodEnd
                      ? new Date(opportunity.servicePeriodEnd).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                      : "\u2014"}
                  </dd>
                </div>
              </dl>
              {revenueSchedule.length > 0 ? (
                <div className="rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Month</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueSchedule.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5 text-xs">
                            {new Date(row.month).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                            {row.amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No schedule data available.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {opportunity.description && (
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {opportunity.description}
              </p>
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
            <div className="grid gap-6">
              <ActivityComposer
                opportunityId={opportunity.id}
                accountId={opportunity.accountId}
                createAction={createActivityAction}
                onCreated={() => router.refresh()}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityTimeline
                    activities={activities.filter((a) => a.type === "note")}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsPanel>

          <TabsPanel value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityTimeline activities={activities} />
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
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  Document storage coming in T-063.
                </p>
              </CardContent>
            </Card>
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  )
}
