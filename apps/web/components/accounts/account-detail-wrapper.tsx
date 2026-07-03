"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, Globe, MapPin, Briefcase, Mail, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AccountForm, TAX_CF_KEYS } from "@/components/accounts/account-form"
import { CustomFieldsDisplay } from "@/components/contacts/custom-fields-display"
import { AccountTaxIdsDisplay } from "@/components/accounts/account-tax-ids-display"
import { ActivityComposer } from "@/components/opportunities/activity-composer"
import { ActivityTimeline } from "@/components/opportunities/activity-timeline"
import { RelationshipTree } from "@/components/accounts/relationship-tree"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { Money } from "@/lib/money"
import type { AccountRecord, AccountUpdateInput, AccountRelationshipGraph, AccountOpportunity, AccountDocument, AccountRelationshipKind } from "@/lib/data/accounts"
import type { ActivityRecord } from "@/lib/data/activities"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import type { TaxIdType, AccountTaxId } from "@/lib/data/account-tax-ids"
import type { TaxIdRow } from "@/components/accounts/tax-ids-editor"
import type { EntityOption } from "@/components/entity-combobox"

interface AccountDetailWrapperProps {
  account: AccountRecord
  fieldDefinitions: FieldDefinition[]
  taxIdTypes: TaxIdType[]
  taxIds: AccountTaxId[]
  relationshipGraph: AccountRelationshipGraph | null
  contacts: { id: string; fullName: string; title: string | null; email: string | null }[]
  opportunities: AccountOpportunity[]
  documents: AccountDocument[]
  ownerName: string | null
  ownerOptions: EntityOption[]
  accountOptions: EntityOption[]
  currentUserId?: string
  activities: ActivityRecord[]
  parentRelationship?: { toAccountId: string; kind: AccountRelationshipKind } | null
  updateAction: (id: string, input: AccountUpdateInput) => Promise<AccountRecord>
  saveTaxIdsAction: (accountId: string, input: { taxIds: TaxIdRow[] }) => Promise<void>
  createActivityAction: (accountId: string, input: unknown) => Promise<ActivityRecord>
  saveRelationshipAction?: (data: { parentAccountId: string; kind: AccountRelationshipKind }) => Promise<void>
}

export function AccountDetailWrapper({
  account,
  fieldDefinitions,
  taxIdTypes,
  taxIds,
  relationshipGraph,
  contacts,
  opportunities,
  documents,
  ownerName,
  ownerOptions,
  accountOptions,
  currentUserId,
  activities,
  parentRelationship,
  updateAction,
  saveTaxIdsAction,
  createActivityAction,
  saveRelationshipAction,
}: AccountDetailWrapperProps) {
  const router = useRouter()

  // The legacy tax_* custom fields are superseded by structured tax IDs — hide
  // them from the read-view so tax data isn't shown twice (and the stale
  // custom-field copies don't linger). See TAX_CF_KEYS in account-form.
  const displayFieldDefinitions = fieldDefinitions.filter(
    (d) => !TAX_CF_KEYS.includes(d.key),
  )

  const hasRelationships = (relationshipGraph?.root.children.length ?? 0) > 0

  const formattedWebsite = account.website
    ? (() => {
        try {
          return new URL(
            account.website.startsWith("http") ? account.website : `https://${account.website}`,
          ).hostname
        } catch {
          return account.website
        }
      })()
    : null

  return (
    <div className="relative">
      <div className="absolute top-6 right-6 z-10">
        <AccountForm
          account={account}
          fieldDefinitions={fieldDefinitions}
          taxIdTypes={taxIdTypes}
          initialTaxIds={taxIds}
          ownerOptions={ownerOptions}
          accountOptions={accountOptions}
          currentUserId={currentUserId}
          parentRelationship={parentRelationship}
          createAction={async () => {
            throw new Error("Not available")
          }}
          updateAction={updateAction}
          saveTaxIdsAction={saveTaxIdsAction}
          onSaveRelationship={saveRelationshipAction}
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
                  {account.name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {account.industry && (
                    <Badge variant="secondary">
                      {account.industry}
                    </Badge>
                  )}
                  {ownerName && (
                    <span className="text-sm text-muted-foreground ml-1">{ownerName}</span>
                  )}
                  {!ownerName && (
                    <span className="text-sm text-muted-foreground ml-1">Unassigned</span>
                  )}
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
                  <dt className="text-xs text-muted-foreground">Legal Name</dt>
                  <dd className="text-sm font-medium">
                    {account.legalName ?? "\u2014"}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Website</dt>
                  <dd className="text-sm font-medium">
                    {account.website ? (
                      <a
                        href={account.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Globe className="size-3" />
                        {formattedWebsite}
                      </a>
                    ) : (
                      "\u2014"
                    )}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Country</dt>
                  <dd className="text-sm font-medium">
                    {account.country ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3 text-muted-foreground" />
                        {account.country}
                      </span>
                    ) : (
                      "\u2014"
                    )}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">Industry</dt>
                  <dd className="text-sm font-medium">
                    {account.industry ? (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="size-3 text-muted-foreground" />
                        {account.industry}
                      </span>
                    ) : (
                      "\u2014"
                    )}
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
                <dl className="grid gap-4">
                  <div className="grid gap-1">
                    <dt className="text-xs text-muted-foreground">Owner</dt>
                    <dd className="text-sm font-medium">
                      {ownerName ?? "\u2014"}
                    </dd>
                  </div>
                  {account.emailDomains && account.emailDomains.length > 0 && (
                    <div className="grid gap-1">
                      <dt className="text-xs text-muted-foreground">Email Domains</dt>
                      <dd>
                        <div className="flex flex-wrap gap-1">
                          {account.emailDomains.map((domain) => (
                            <Badge key={domain} variant="outline" className="gap-1">
                              <Mail className="size-3" />
                              {domain}
                            </Badge>
                          ))}
                        </div>
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
          </Card>
        </div>

        {account.description && (
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {account.description}
              </p>
            </CardContent>
          </Card>
        )}

        <AccountTaxIdsDisplay taxIds={taxIds} taxIdTypes={taxIdTypes} />

        <CustomFieldsDisplay
          fieldDefinitions={displayFieldDefinitions}
          customData={account.customData}
        />

        {contacts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Contacts ({contacts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <div>
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {contact.fullName}
                      </Link>
                      {contact.title && (
                        <p className="text-xs text-muted-foreground">{contact.title}</p>
                      )}
                    </div>
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-xs text-muted-foreground hover:text-primary"
                      >
                        {contact.email}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {opportunities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Opportunities ({opportunities.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {opportunities.map((opp) => (
                  <div
                    key={opp.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <div>
                      <Link
                        href={`/opportunities/${opp.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {opp.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs">
                          {getStageLabel(opp.stage)}
                        </Badge>
                        {opp.probabilityPct > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {opp.probabilityPct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {Money.fromAmount(opp.amount, opp.currency).toDisplay()}
                      </p>
                      {opp.closeDate && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(opp.closeDate).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Documents ({documents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{doc.category}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.uploadedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {hasRelationships && <RelationshipTree graph={relationshipGraph} />}

        {contacts.length === 0 && opportunities.length === 0 && documents.length === 0 && !hasRelationships && (
          <Card>
            <CardContent className="py-6">
              <p className="text-center text-sm text-muted-foreground">
                No related contacts, opportunities, documents, or linked accounts yet.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActivityComposer
              revalidateId={account.id}
              scope={{ accountId: account.id }}
              createAction={createActivityAction}
              onCreated={() => router.refresh()}
            />
            <ActivityTimeline activities={activities} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
