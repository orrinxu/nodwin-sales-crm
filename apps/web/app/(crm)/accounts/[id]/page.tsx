import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getAccountById,
  getAccountRelationships,
  getContactsForAccount,
  getOpportunitiesForAccount,
  getOwnerOptions,
  getAccountLinkedDocuments,
  getAccounts,
} from "@/lib/data/accounts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getActivitiesForAccount } from "@/lib/data/activities"
import { updateAccountAction, upsertAccountRelationshipAction, createAccountActivityAction } from "../actions"
import { AccountDetailWrapper } from "@/components/accounts/account-detail-wrapper"

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }
  const [account, fieldDefinitions, relationships, contacts, opportunities, owners, documents, activities, { accounts: allAccounts }] = await Promise.all([
    getAccountById(ctx, id),
    getFieldDefinitions(ctx, "account"),
    getAccountRelationships(ctx, id),
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
      relationships={relationships}
      contacts={contacts}
      opportunities={opportunities}
      documents={documents}
      ownerName={owner?.name ?? null}
      ownerOptions={ownerOptions}
      accountOptions={accountOptions}
      currentUserId={user.id}
      activities={activities}
      canManage={user.role === "admin"}
      parentRelationship={parentRelationship}
      updateAction={updateAccountAction}
      createActivityAction={createAccountActivityAction}
      saveRelationshipAction={saveRelationship}
    />
  )
}
