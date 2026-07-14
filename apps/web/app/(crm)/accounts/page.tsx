import { requireUser } from "@/lib/security/auth"
import { getAccounts, getIndustryOptions, getOwnerOptions } from "@/lib/data/accounts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getTaxIdTypes } from "@/lib/data/account-tax-ids"
import { createAccountAction, bulkDeleteAccountsAction, saveAccountTaxIdsAction } from "./actions"
import { generateAccountAction } from "./generate-actions"
import { extractDocumentTextAction } from "@/app/(crm)/opportunities/generate-actions"
import { AccountsList } from "@/components/accounts/accounts-list"

export default async function AccountsPage() {
  const user = await requireUser()

  const ctx = { user, source: "web" as const }
  const [{ accounts }, industries, owners, fieldDefinitions, taxIdTypes] = await Promise.all([
    getAccounts(ctx),
    getIndustryOptions(ctx),
    getOwnerOptions(ctx),
    getFieldDefinitions(ctx, "account"),
    getTaxIdTypes(ctx),
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
      taxIdTypes={taxIdTypes}
      currentUserId={user.id}
      createAction={createAccountAction}
      saveTaxIdsAction={saveAccountTaxIdsAction}
      bulkDeleteAction={bulkDeleteAccountsAction}
      generateAction={generateAccountAction}
      extractFileAction={extractDocumentTextAction}
    />
  )
}
