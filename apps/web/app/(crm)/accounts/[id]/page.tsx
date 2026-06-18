import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import {
  getAccountById,
  getAccountRelationshipGraph,
  getContactsForAccount,
  getOpportunitiesForAccount,
  getOwnerOptions,
} from "@/lib/data/accounts"
import { getStageLabelMap } from "@/lib/data/sales-process-config"
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
  const [account, fieldDefinitions, relationshipGraph, contacts, opportunities, owners, stageLabels] = await Promise.all([
    getAccountById(ctx, id),
    getFieldDefinitions(ctx, "account"),
    getAccountRelationshipGraph(ctx, id).catch(() => null),
    getContactsForAccount(ctx, id).catch(() => []),
    getOpportunitiesForAccount(ctx, id).catch(() => []),
    getOwnerOptions(ctx).catch(() => []),
    getStageLabelMap(),
  ])

  if (!account) {
    notFound()
  }

  const owner = owners.find((o) => o.id === account.accountOwnerUserId) ?? null

  return (
    <AccountDetailWrapper
      account={account}
      fieldDefinitions={fieldDefinitions}
      relationshipGraph={relationshipGraph}
      contacts={contacts}
      opportunities={opportunities}
      stageLabels={stageLabels}
      ownerName={owner?.name ?? null}
      updateAction={updateAccountAction}
    />
  )
}
