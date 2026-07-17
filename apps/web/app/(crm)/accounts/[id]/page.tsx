import { notFound } from "next/navigation"
import { requireUser, isSuperAdmin } from "@/lib/security/auth"
import {
  getAccountById,
  getAccountRelationships,
  getAccountRelationshipGraph,
  getContactsForAccount,
  getOpportunitiesForAccount,
  getOwnerOptions,
} from "@/lib/data/accounts"
import { listDocumentsForEntity } from "@/lib/data/documents"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getTaxIdTypes, getTaxIdsForAccount } from "@/lib/data/account-tax-ids"
import { getActivitiesForAccount } from "@/lib/data/activities"
import { getContactOptions, getAccountOptions } from "@/lib/data/contacts"
import {
  updateAccountAction,
  upsertAccountRelationshipAction,
  createAccountActivityAction,
  saveAccountTaxIdsAction,
  attachContactsToAccountAction,
  detachContactFromAccountAction,
  createContactForAccountAction,
} from "../actions"
import { AccountDetailWrapper } from "@/components/accounts/account-detail-wrapper"

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }
  // Attaching/creating contacts writes to admin-only RLS tables, so only offer
  // it (and fetch the picker list) for admins.
  const canManageContacts = isSuperAdmin(user)
  const [account, fieldDefinitions, taxIdTypes, taxIds, relationships, relationshipGraph, contacts, opportunities, owners, documents, activities, allAccounts, contactOptions] = await Promise.all([
    getAccountById(ctx, id),
    getFieldDefinitions(ctx, "account"),
    getTaxIdTypes(ctx),
    getTaxIdsForAccount(ctx, id),
    getAccountRelationships(ctx, id),
    getAccountRelationshipGraph(ctx, id),
    getContactsForAccount(ctx, id),
    getOpportunitiesForAccount(ctx, id),
    getOwnerOptions(ctx),
    listDocumentsForEntity(ctx, { accountId: id }),
    getActivitiesForAccount(ctx, id),
    // Lightweight id/name list for the relationship-target dropdown (ORR-760) —
    // the old getAccounts fetched every column + a per-row contact_count subquery.
    getAccountOptions(ctx),
    canManageContacts ? getContactOptions(ctx) : Promise.resolve([]),
  ])

  if (!account) {
    notFound()
  }

  const owner = owners.find((o) => o.id === account.accountOwnerUserId) ?? null

  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.name }))
  const accountOptions = allAccounts
    .filter((a) => a.id !== id)
    .map((a) => ({ id: a.id, name: a.name }))

  const firstRelationship = relationships[0] ?? null
  const parentRelationship = firstRelationship
    ? {
        toAccountId: firstRelationship.toAccountId,
        kind: firstRelationship.kind,
      }
    : null

  // Only offer contacts not already attached (primary or linked) to this account.
  const relatedContactIds = new Set(contacts.map((c) => c.id))
  const attachableContacts = contactOptions.filter((c) => !relatedContactIds.has(c.id))

  const saveRelationship = async (data: { parentAccountId: string; kind: string }) => {
    "use server"
    await upsertAccountRelationshipAction(id, data.parentAccountId, data.kind as "subsidiary_of" | "procurement_via" | "partner_with" | "parent_of" | "sister_company")
  }

  return (
    <AccountDetailWrapper
      account={account}
      fieldDefinitions={fieldDefinitions}
      taxIdTypes={taxIdTypes}
      taxIds={taxIds}
      relationshipGraph={relationshipGraph}
      contacts={contacts}
      opportunities={opportunities}
      documents={documents}
      ownerName={owner?.name ?? null}
      ownerOptions={ownerOptions}
      accountOptions={accountOptions}
      currentUserId={user.id}
      activities={activities}
      parentRelationship={parentRelationship}
      canManageContacts={canManageContacts}
      attachableContacts={attachableContacts}
      updateAction={updateAccountAction}
      saveTaxIdsAction={saveAccountTaxIdsAction}
      createActivityAction={createAccountActivityAction}
      saveRelationshipAction={saveRelationship}
      attachContactsAction={attachContactsToAccountAction}
      detachContactAction={detachContactFromAccountAction}
      createContactAction={createContactForAccountAction}
    />
  )
}
