import { requireUser } from "@/lib/security/auth"
import {
  getAccounts,
  getAccountIndustries,
  accountFiltersSchema,
} from "@/lib/data/accounts"
import { getUserOptions } from "@/lib/data/users"
import { AccountsTable } from "@/components/accounts/accounts-table"
import { createAccountAction } from "./actions"

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const user = await requireUser()
  const raw = await searchParams

  const filters = accountFiltersSchema.parse({
    q: raw.q,
    industry: raw.industry,
    page: raw.page,
    pageSize: raw.pageSize,
  })

  const ctx = { user, source: "web" as const }
  const [result, industries, users] = await Promise.all([
    getAccounts(ctx, filters),
    getAccountIndustries(ctx),
    getUserOptions(ctx),
  ])

  return (
    <AccountsTable
      accounts={result.accounts}
      totalCount={result.totalCount}
      page={result.page}
      pageSize={result.pageSize}
      totalPages={result.totalPages}
      industries={industries}
      currentQ={filters.q ?? ""}
      currentIndustry={filters.industry ?? ""}
      createAction={createAccountAction}
      users={users}
    />
  )
}
