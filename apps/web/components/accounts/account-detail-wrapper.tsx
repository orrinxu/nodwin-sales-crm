"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Pencil, Globe, MapPin, Briefcase, Mail, FileText, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AccountForm, TAX_CF_KEYS } from "@/components/accounts/account-form"
import { CustomFieldsDisplay } from "@/components/contacts/custom-fields-display"
import { AccountTaxIdsDisplay } from "@/components/accounts/account-tax-ids-display"
import { AttachContactsDialog } from "@/components/accounts/attach-contacts-dialog"
import { ActivityComposer } from "@/components/opportunities/activity-composer"
import { ActivityTimeline } from "@/components/opportunities/activity-timeline"
import { RelationshipTree } from "@/components/accounts/relationship-tree"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { Money } from "@/lib/money"
import type { AccountRecord, AccountUpdateInput, AccountRelationshipGraph, AccountOpportunity, AccountDocument, AccountRelationshipKind, AccountContact } from "@/lib/data/accounts"
import type { ContactPickerOption } from "@/lib/data/contacts"
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
  contacts: AccountContact[]
  opportunities: AccountOpportunity[]
  documents: AccountDocument[]
  ownerName: string | null
  ownerOptions: EntityOption[]
  accountOptions: EntityOption[]
  currentUserId?: string
  activities: ActivityRecord[]
  parentRelationship?: { toAccountId: string; kind: AccountRelationshipKind } | null
  canManageContacts: boolean
  attachableContacts: ContactPickerOption[]
  updateAction: (id: string, input: AccountUpdateInput) => Promise<AccountRecord>
  saveTaxIdsAction: (accountId: string, input: { taxIds: TaxIdRow[] }) => Promise<void>
  createActivityAction: (accountId: string, input: unknown) => Promise<ActivityRecord>
  saveRelationshipAction?: (data: { parentAccountId: string; kind: AccountRelationshipKind }) => Promise<void>
  attachContactsAction: (accountId: string, input: { contactIds: string[] }) => Promise<void>
  detachContactAction: (accountId: string, contactId: string) => Promise<void>
  createContactAction: (accountId: string, input: unknown) => Promise<unknown>
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
  canManageContacts,
  attachableContacts,
  updateAction,
  saveTaxIdsAction,
  createActivityAction,
  saveRelationshipAction,
  attachContactsAction,
  detachContactAction,
  createContactAction,
}: AccountDetailWrapperProps) {
  const router = useRouter()
  const [detachingId, setDetachingId] = useState<string | null>(null)

  async function handleDetach(contactId: string) {
    setDetachingId(contactId)
    try {
      await detachContactAction(account.id, contactId)
      router.refresh()
    } catch {
      // surfaced by a full reload; keep the row on failure
    } finally {
      setDetachingId(null)
    }
  }

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
    <div>
      <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
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
              <div className="shrink-0">
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

        {(contacts.length > 0 || canManageContacts) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Contacts ({contacts.length})</CardTitle>
              {canManageContacts && (
                <AttachContactsDialog
                  accountId={account.id}
                  attachableContacts={attachableContacts}
                  attachAction={attachContactsAction}
                  createAction={createContactAction}
                  onDone={() => router.refresh()}
                />
              )}
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contacts attached yet. Use &ldquo;Attach&rdquo; to link existing contacts or create a new one.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {contact.fullName}
                          </Link>
                          {contact.relation === "primary" && (
                            <Badge variant="secondary" className="text-xs">Primary</Badge>
                          )}
                        </div>
                        {contact.title && (
                          <p className="text-xs text-muted-foreground">{contact.title}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            {contact.email}
                          </a>
                        )}
                        {canManageContacts && contact.relation === "linked" && (
                          <button
                            type="button"
                            onClick={() => handleDetach(contact.id)}
                            disabled={detachingId === contact.id}
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                            aria-label={`Detach ${contact.fullName}`}
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

        {contacts.length === 0 && opportunities.length === 0 && documents.length === 0 && !hasRelationships && !canManageContacts && (
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
