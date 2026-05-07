"use client"

import Link from "next/link"
import { ArrowLeft, Building2, Users, DollarSign, Activity, FileText, GitBranch } from "lucide-react"
import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"
import { AccountTree } from "@/components/accounts/account-tree"
import type { AccountRecord, AccountTreeData } from "@/lib/data/accounts"

interface AccountDetailProps {
  account: AccountRecord
  treeData?: AccountTreeData
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <span className="text-sm">{value}</span>
    </div>
  )
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

const placeholderTab = (icon: ReactNode, title: string, description: string) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
      {icon}
    </div>
    <div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        {description}
      </p>
    </div>
  </div>
)

export function AccountDetail({ account, treeData }: AccountDetailProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/accounts"
          aria-label="Back to accounts"
          className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted shrink-0"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {account.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Account details and information
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTab value="overview">Overview</TabsTab>
          <TabsTab value="contacts">Contacts</TabsTab>
          <TabsTab value="opportunities">Opportunities</TabsTab>
          <TabsTab value="activities">Activities</TabsTab>
          <TabsTab value="documents">Documents</TabsTab>
          <TabsTab value="tree">Tree</TabsTab>
        </TabsList>

        <TabsPanel value="overview">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-4" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2">
                  <DetailRow label="Name" value={account.name} />
                  <DetailRow
                    label="Legal Name"
                    value={account.legalName ?? "—"}
                  />
                  <DetailRow
                    label="Website"
                    value={
                      account.website ? (
                        <a
                          href={account.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {(() => { try { return new URL(account.website).hostname } catch { return account.website } })()}
                        </a>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow
                    label="Industry"
                    value={account.industry ?? "—"}
                  />
                  <DetailRow
                    label="Country"
                    value={account.country ?? "—"}
                  />
                  <DetailRow
                    label="Account Owner"
                    value={account.ownerName ?? "—"}
                  />
                  <DetailRow
                    label="Email Domains"
                    value={
                      account.emailDomains && account.emailDomains.length > 0
                        ? account.emailDomains.join(", ")
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Created"
                    value={formatDate(account.createdAt)}
                  />
                  <DetailRow
                    label="Updated"
                    value={formatDate(account.updatedAt)}
                  />
                </div>
              </CardContent>
            </Card>

            {account.description && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {account.description}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsPanel>

        <TabsPanel value="contacts">
          {placeholderTab(
            <Users className="size-5 text-muted-foreground" />,
            "Contacts",
            "View and manage contacts associated with this account."
          )}
        </TabsPanel>

        <TabsPanel value="opportunities">
          {placeholderTab(
            <DollarSign className="size-5 text-muted-foreground" />,
            "Opportunities",
            "Track open deals and sales opportunities for this account."
          )}
        </TabsPanel>

        <TabsPanel value="activities">
          {placeholderTab(
            <Activity className="size-5 text-muted-foreground" />,
            "Activities",
            "Review calls, meetings, emails, and other activities logged for this account."
          )}
        </TabsPanel>

        <TabsPanel value="documents">
          {placeholderTab(
            <FileText className="size-5 text-muted-foreground" />,
            "Documents",
            "Access contracts, proposals, and other documents related to this account."
          )}
        </TabsPanel>

        <TabsPanel value="tree">
          {treeData ? (
            <AccountTree data={treeData} />
          ) : (
            placeholderTab(
              <GitBranch className="size-5 text-muted-foreground" />,
              "Account Tree",
              "Explore the hierarchical relationships between accounts."
            )
          )}
        </TabsPanel>
      </Tabs>
    </div>
  )
}
