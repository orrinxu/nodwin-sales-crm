import { requireUser } from "@/lib/security/auth"
import {
  getAccounts,
  getIndustryOptions,
  getOwnerOptions,
  ACCOUNT_SORT_COLUMNS,
  type AccountListSearchParams,
  type AccountSort,
  type AccountSortColumn,
} from "@/lib/data/accounts"
import { getAccountOptions } from "@/lib/data/contacts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getTaxIdTypes } from "@/lib/data/account-tax-ids"
import { isTranscriptionAvailable } from "@/lib/data/ai-settings"
import { DEFAULT_PAGE_SIZE, clampPage } from "@/lib/list/pagination"
import { createAccountAction, bulkDeleteAccountsAction, saveAccountTaxIdsAction } from "./actions"
import { generateAccountAction } from "./generate-actions"
import { extractDocumentTextAction, transcribeAudioAction } from "@/app/(crm)/opportunities/generate-actions"
import { AccountsList } from "@/components/accounts/accounts-list"

/** Parse `?sort=` / `?dir=` into a validated sort. Accounts default to name ASC,
 *  so an absent direction is treated as ascending. */
function parseSort(
  sortParam: string | undefined,
  dirParam: string | undefined,
): AccountSort | undefined {
  if (!sortParam) return undefined
  if (!ACCOUNT_SORT_COLUMNS.includes(sortParam as AccountSortColumn)) return undefined
  return {
    column: sortParam as AccountSortColumn,
    direction: dirParam === "desc" ? "desc" : "asc",
  }
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    industry?: string
    owner?: string
    sort?: string
    dir?: string
    page?: string
  }>
}) {
  const sp = await searchParams
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const params: AccountListSearchParams = {
    query: sp.q,
    industry: sp.industry,
    ownerId: sp.owner,
    sort: parseSort(sp.sort, sp.dir),
    page: clampPage(sp.page ? Number(sp.page) : 1),
    pageSize: DEFAULT_PAGE_SIZE,
  }

  const [
    listResult,
    industries,
    owners,
    accountOptionsRaw,
    fieldDefinitions,
    taxIdTypes,
    voiceEnabled,
  ] = await Promise.all([
    getAccounts(ctx, params),
    getIndustryOptions(ctx),
    getOwnerOptions(ctx),
    getAccountOptions(ctx),
    getFieldDefinitions(ctx, "account"),
    getTaxIdTypes(ctx),
    isTranscriptionAvailable(),
  ])

  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.name }))
  // Parent-account picker options come from the full account list (not the
  // paginated page), so the form isn't limited to the 25 rows on screen.
  const accountOptions = accountOptionsRaw.map((a) => ({ id: a.id, name: a.name }))

  return (
    <AccountsList
      accounts={listResult.accounts}
      totalCount={listResult.totalCount}
      page={listResult.page}
      pageSize={listResult.pageSize}
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
      transcribeAction={voiceEnabled ? transcribeAudioAction : undefined}
    />
  )
}
