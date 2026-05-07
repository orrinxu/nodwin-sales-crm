import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
import { getAccountById, getAccountIndustries, getAccountTree } from "@/lib/data/accounts"
import { getUserOptions } from "@/lib/data/users"
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
  const [account, industries, users, treeData] = await Promise.all([
    getAccountById(ctx, id),
    getAccountIndustries(ctx),
    getUserOptions(ctx),
    getAccountTree(ctx, id).catch(() => null),
  ])

  if (!account) {
    notFound()
  }

  return (
    <AccountDetailWrapper
      account={account}
      industries={industries}
      users={users}
      treeData={treeData ?? undefined}
      updateAction={updateAccountAction}
    />
  )
}
