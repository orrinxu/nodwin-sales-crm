import { requireUser } from "@/lib/security/auth"
import { getAccounts, getIndustryOptions, getOwnerOptions } from "@/lib/data/accounts"
import { createAccountAction, bulkDeleteAccountsAction } from "./actions"
import { AccountsList } from "@/components/accounts/accounts-list"

export default async function AccountsPage() {
  const user = await requireUser()

  const ctx = { user, source: "web" as const }
  const [{ accounts }, industries, owners] = await Promise.all([
    getAccounts(ctx),
    getIndustryOptions(ctx),
    getOwnerOptions(ctx),
  ])

  return (
    <AccountsList
      accounts={accounts}
      industryOptions={industries}
      ownerOptions={owners}
      createAction={createAccountAction}
      bulkDeleteAction={bulkDeleteAccountsAction}
    />
  )
}
