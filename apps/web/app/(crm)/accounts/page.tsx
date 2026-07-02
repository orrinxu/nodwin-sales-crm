import { requireUser } from "@/lib/security/auth"
import { getAccounts, getIndustryOptions, getOwnerOptions } from "@/lib/data/accounts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { createAccountAction, bulkDeleteAccountsAction } from "./actions"
import { AccountsList } from "@/components/accounts/accounts-list"

export default async function AccountsPage() {
  const user = await requireUser()

  const ctx = { user, source: "web" as const }
  const [{ accounts }, industries, owners, fieldDefinitions] = await Promise.all([
    getAccounts(ctx),
    getIndustryOptions(ctx),
    getOwnerOptions(ctx),
    getFieldDefinitions(ctx, "account"),
  ])

  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.name }))
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))

  return (
    <AccountsList
      accounts={accounts}
      industryOptions={industries}
      ownerOptions={ownerOptions}
      accountOptions={accountOptions}
      fieldDefinitions={fieldDefinitions}
      currentUserId={user.id}
      canManage={user.role === "admin"}
      createAction={createAccountAction}
      bulkDeleteAction={bulkDeleteAccountsAction}
    />
  )
}
