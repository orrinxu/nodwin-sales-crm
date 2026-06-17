import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getAccountById,
  getAccountRelationships,
  getContactsForAccount,
  getOpportunitiesForAccount,
  getOwnerOptions,
} from "@/lib/data/accounts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { updateAccountAction } from "../actions"
import { AccountDetailWrapper } from "@/components/accounts/account-detail-wrapper"

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }
  const [account, fieldDefinitions, relationships, contacts, opportunities, owners] = await Promise.all([
    getAccountById(ctx, id),
    getFieldDefinitions(ctx, "account"),
    getAccountRelationships(ctx, id).catch(() => []),
    getContactsForAccount(ctx, id).catch(() => []),
    getOpportunitiesForAccount(ctx, id).catch(() => []),
    getOwnerOptions(ctx).catch(() => []),
  ])

  if (!account) {
    notFound()
  }

  const owner = owners.find((o) => o.id === account.accountOwnerUserId) ?? null

  return (
    <AccountDetailWrapper
      account={account}
      fieldDefinitions={fieldDefinitions}
      relationships={relationships}
      contacts={contacts}
      opportunities={opportunities}
      ownerName={owner?.name ?? null}
      updateAction={updateAccountAction}
    />
  )
}
