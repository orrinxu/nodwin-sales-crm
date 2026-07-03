import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getAccountById,
  getAccountRelationships,
  getAccountRelationshipGraph,
  getContactsForAccount,
  getOpportunitiesForAccount,
  getOwnerOptions,
  getAccountLinkedDocuments,
  getAccounts,
} from "@/lib/data/accounts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getTaxIdTypes, getTaxIdsForAccount } from "@/lib/data/account-tax-ids"
import { getActivitiesForAccount } from "@/lib/data/activities"
import { updateAccountAction, upsertAccountRelationshipAction, createAccountActivityAction, saveAccountTaxIdsAction } from "../actions"
import { AccountDetailWrapper } from "@/components/accounts/account-detail-wrapper"

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }
  const [account, fieldDefinitions, taxIdTypes, taxIds, relationships, relationshipGraph, contacts, opportunities, owners, documents, activities, { accounts: allAccounts }] = await Promise.all([
    getAccountById(ctx, id),
    getFieldDefinitions(ctx, "account"),
    getTaxIdTypes(ctx),
    getTaxIdsForAccount(ctx, id),
    getAccountRelationships(ctx, id),
    getAccountRelationshipGraph(ctx, id),
    getContactsForAccount(ctx, id),
    getOpportunitiesForAccount(ctx, id),
    getOwnerOptions(ctx),
    getAccountLinkedDocuments(ctx, id),
    getActivitiesForAccount(ctx, id),
    getAccounts(ctx),
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
      updateAction={updateAccountAction}
      saveTaxIdsAction={saveAccountTaxIdsAction}
      createActivityAction={createAccountActivityAction}
      saveRelationshipAction={saveRelationship}
    />
  )
}
