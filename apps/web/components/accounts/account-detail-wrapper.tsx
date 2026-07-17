"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useCallback } from "react"
import { Pencil, Globe, MapPin, Mail, X, ArrowRight } from "lucide-react"

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
import { FacetTabs, FacetTabsList, FacetTabsTab, FacetTabsPanel } from "@/components/primitives/facet-tabs"
import { RecordHeader } from "@/components/primitives/record-header"
import { DefinitionField, DefinitionFieldGrid } from "@/components/primitives/definition-grid"
import { FilesModule } from "@/components/documents/files-module"
import { PinnedDocumentSlots } from "@/components/documents/pinned-document-slots"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { Money } from "@/lib/money"
import type { AccountRecord, AccountUpdateInput, AccountRelationshipGraph, AccountOpportunity, AccountRelationshipKind, AccountContact } from "@/lib/data/accounts"
import type { DocumentSummary } from "@/lib/data/documents"
import type { ContactPickerOption } from "@/lib/data/contacts"
import type { ActivityRecord } from "@/lib/data/activities"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import type { TaxIdType, AccountTaxId } from "@/lib/data/account-tax-ids"
import type { TaxIdRow } from "@/components/accounts/tax-ids-editor"
import type { EntityOption } from "@/components/entity-combobox"
import { usePreferences } from "@/components/providers/preferences-provider"

const CARD_HEADING = "text-[13.5px] font-semibold tracking-[-0.01em]"

/** Peek card header: a section title with a "jump to full tab" affordance. */
function PeekHeader({ title, cta, onClick }: { title: string; cta: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <CardTitle className={CARD_HEADING}>{title}</CardTitle>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {cta} <ArrowRight className="size-3" />
      </button>
    </div>
  )
}

interface AccountDetailWrapperProps {
  account: AccountRecord
  fieldDefinitions: FieldDefinition[]
  taxIdTypes: TaxIdType[]
  taxIds: AccountTaxId[]
  relationshipGraph: AccountRelationshipGraph | null
  contacts: AccountContact[]
  opportunities: AccountOpportunity[]
  documents: DocumentSummary[]
  ownerName: string | null
  ownerOptions: EntityOption[]
  accountOptions: EntityOption[]
  currentUserId?: string
  activities: ActivityRecord[]
  parentRelationship?: { toAccountId: string; toAccountName?: string; kind: AccountRelationshipKind } | null
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
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
  searchAccountsAction,
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
  const { formatDate } = usePreferences()
  const [tab, setTab] = useState("overview")
  const [detachingId, setDetachingId] = useState<string | null>(null)

  const handleDetach = useCallback(
    async (contactId: string) => {
      setDetachingId(contactId)
      try {
        await detachContactAction(account.id, contactId)
        router.refresh()
      } catch {
        // surfaced by a full reload; keep the row on failure
      } finally {
        setDetachingId(null)
      }
    },
    [detachContactAction, account.id, router],
  )

  // The legacy tax_* custom fields are superseded by structured tax IDs — hide
  // them from the read-view so tax data isn't shown twice.
  const displayFieldDefinitions = fieldDefinitions.filter((d) => !TAX_CF_KEYS.includes(d.key))
  const hasRelationships = (relationshipGraph?.root.children.length ?? 0) > 0

  const formattedWebsite = account.website
    ? (() => {
        try {
          return new URL(account.website.startsWith("http") ? account.website : `https://${account.website}`).hostname
        } catch {
          return account.website
        }
      })()
    : null

  const websiteLink = account.website ? (
    <a
      href={account.website}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <Globe className="size-3" />
      {formattedWebsite}
    </a>
  ) : undefined

  const emailDomainsEl =
    account.emailDomains && account.emailDomains.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {account.emailDomains.map((domain) => (
          <Badge key={domain} variant="outline" className="gap-1">
            <Mail className="size-3" />
            {domain}
          </Badge>
        ))}
      </div>
    ) : undefined

  const countryEl = account.country ? (
    <span className="inline-flex items-center gap-1">
      <MapPin className="size-3 text-muted-foreground" />
      {account.country}
    </span>
  ) : undefined

  const editButton = (
    <AccountForm
      account={account}
      fieldDefinitions={fieldDefinitions}
      taxIdTypes={taxIdTypes}
      initialTaxIds={taxIds}
      ownerOptions={ownerOptions}
      accountOptions={accountOptions}
      currentUserId={currentUserId}
      parentRelationship={parentRelationship}
      searchAccountsAction={searchAccountsAction}
      createAction={async () => {
        throw new Error("Not available")
      }}
      updateAction={updateAction}
      saveTaxIdsAction={saveTaxIdsAction}
      onSaveRelationship={saveRelationshipAction}
      onSuccess={() => router.refresh()}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      }
    />
  )

  return (
    <div className="relative flex flex-col gap-4 p-6">
      <RecordHeader
        title={account.name}
        subtitle={account.industry ?? undefined}
        actions={editButton}
        stats={[
          { label: "Owner", value: ownerName ?? "Unassigned" },
          { label: "Country", value: account.country ?? "—" },
          { label: "Opportunities", value: String(opportunities.length) },
          { label: "Contacts", value: String(contacts.length) },
        ]}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <FacetTabs value={tab} onValueChange={(v) => setTab(v as string)}>
            <FacetTabsList>
              <FacetTabsTab value="overview">Overview</FacetTabsTab>
              <FacetTabsTab value="details">Details</FacetTabsTab>
              <FacetTabsTab value="contacts">Contacts</FacetTabsTab>
              <FacetTabsTab value="opportunities">Opportunities</FacetTabsTab>
              <FacetTabsTab value="files">Files</FacetTabsTab>
              <FacetTabsTab value="activity">Activity</FacetTabsTab>
            </FacetTabsList>

            {/* OVERVIEW */}
            <FacetTabsPanel value="overview" className="space-y-4">
              <Card>
                <CardHeader className="pb-0">
                  <PeekHeader title="Key details" cta="View all details" onClick={() => setTab("details")} />
                </CardHeader>
                <CardContent>
                  <DefinitionFieldGrid>
                    <DefinitionField label="Legal name" value={account.legalName} emptyMode="dash" />
                    <DefinitionField label="Website" emptyMode="dash">{websiteLink}</DefinitionField>
                    <DefinitionField label="Country" emptyMode="dash">{countryEl}</DefinitionField>
                    <DefinitionField label="Industry" value={account.industry} emptyMode="dash" />
                  </DefinitionFieldGrid>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-0">
                  <PeekHeader title="Recent activity" cta="Open Activity" onClick={() => setTab("activity")} />
                </CardHeader>
                <CardContent>
                  {activities.length > 0 ? (
                    <ActivityTimeline activities={activities.slice(0, 3)} />
                  ) : (
                    <p className="py-2 text-xs text-muted-foreground">No activity yet. Add a note from the Activity tab.</p>
                  )}
                </CardContent>
              </Card>

              {hasRelationships && <RelationshipTree graph={relationshipGraph} />}
            </FacetTabsPanel>

            {/* DETAILS */}
            <FacetTabsPanel value="details" className="space-y-4">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className={CARD_HEADING}>Account details</CardTitle>
                </CardHeader>
                <CardContent>
                  <DefinitionFieldGrid>
                    <DefinitionField label="Legal name" value={account.legalName} emptyMode="dash" />
                    <DefinitionField label="Website" emptyMode="dash">{websiteLink}</DefinitionField>
                    <DefinitionField label="Country" emptyMode="dash">{countryEl}</DefinitionField>
                    <DefinitionField label="Industry" value={account.industry} emptyMode="dash" />
                    <DefinitionField label="Owner" value={ownerName} emptyMode="dash" />
                    <DefinitionField label="Email domains" emptyMode="dash">{emailDomainsEl}</DefinitionField>
                  </DefinitionFieldGrid>
                </CardContent>
              </Card>

              {account.description && (
                <Card>
                  <CardHeader className="pb-0">
                    <CardTitle className={CARD_HEADING}>Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-foreground/90">{account.description}</p>
                  </CardContent>
                </Card>
              )}

              <AccountTaxIdsDisplay taxIds={taxIds} taxIdTypes={taxIdTypes} />
              <CustomFieldsDisplay fieldDefinitions={displayFieldDefinitions} customData={account.customData} />
            </FacetTabsPanel>

            {/* CONTACTS */}
            <FacetTabsPanel value="contacts">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className={CARD_HEADING}>Contacts ({contacts.length})</CardTitle>
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
                        <div key={contact.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/contacts/${contact.id}`} className="text-sm font-medium text-primary hover:underline">
                                {contact.fullName}
                              </Link>
                              {contact.relation === "primary" && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                            </div>
                            {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="text-xs text-muted-foreground hover:text-primary">
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
            </FacetTabsPanel>

            {/* OPPORTUNITIES */}
            <FacetTabsPanel value="opportunities">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className={CARD_HEADING}>Opportunities ({opportunities.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {opportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No opportunities for this account yet.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {opportunities.map((opp) => (
                        <div key={opp.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                          <div>
                            <Link href={`/opportunities/${opp.id}`} className="text-sm font-medium text-primary hover:underline">
                              {opp.name}
                            </Link>
                            <div className="mt-0.5 flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{getStageLabel(opp.stage)}</Badge>
                              {opp.probabilityPct > 0 && (
                                <span className="text-xs text-muted-foreground">{opp.probabilityPct}%</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{Money.fromAmount(opp.amount, opp.currency).toDisplay()}</p>
                            {opp.closeDate && <p className="text-xs text-muted-foreground">{formatDate(opp.closeDate, "—")}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </FacetTabsPanel>

            {/* FILES */}
            <FacetTabsPanel value="files" className="space-y-4">
              <PinnedDocumentSlots documents={documents} categories={["rfp", "proposal", "contract"]} />
              <FilesModule accountId={account.id} initialDocuments={documents} />
            </FacetTabsPanel>

            {/* ACTIVITY */}
            <FacetTabsPanel value="activity">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className={CARD_HEADING}>Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ActivityComposer
                    revalidateId={account.id}
                    scope={{ accountId: account.id }}
                    createAction={createActivityAction}
                    onCreated={() => router.refresh()}
                    notesOnly
                  />
                  <ActivityTimeline activities={activities} />
                </CardContent>
              </Card>
            </FacetTabsPanel>
          </FacetTabs>
        </div>

        {/* Rail — quick facts + brand guidelines (always visible). */}
        <div className="w-full shrink-0 space-y-4 lg:sticky lg:top-6 lg:w-[340px]">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className={CARD_HEADING}>Quick facts</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionFieldGrid className="sm:grid-cols-1">
                <DefinitionField label="Website" emptyMode="dash">{websiteLink}</DefinitionField>
                <DefinitionField label="Legal name" value={account.legalName} emptyMode="dash" />
                <DefinitionField label="Email domains" emptyMode="dash">{emailDomainsEl}</DefinitionField>
              </DefinitionFieldGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className={CARD_HEADING}>Brand guidelines</CardTitle>
            </CardHeader>
            <CardContent>
              <PinnedDocumentSlots documents={documents} categories={["brand_guidelines"]} columns={1} />
              <p className="mt-2 text-[11.5px] text-muted-foreground">Upload in the Files tab and tag it “Brand guidelines”.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
