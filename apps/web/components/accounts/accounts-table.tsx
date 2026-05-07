"use client"

import { useCallback, useRef, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, ChevronLeft, ChevronRight, Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import type { AccountRecord, AccountCreateInput } from "@/lib/data/accounts"
import type { UserOption } from "@/lib/data/users"
import { AccountForm } from "@/components/accounts/account-form"

interface AccountsTableProps {
  accounts: AccountRecord[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  industries: string[]
  currentQ: string
  currentIndustry: string
  createAction: (input: AccountCreateInput) => Promise<AccountRecord>
  users: UserOption[]
}

export function AccountsTable({
  accounts,
  totalCount,
  page,
  pageSize,
  totalPages,
  industries,
  currentQ,
  currentIndustry,
  createAction,
  users,
}: AccountsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const navigateWithParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }
      const qs = params.toString()
      startTransition(() => {
        router.push(`/accounts${qs ? `?${qs}` : ""}`)
      })
    },
    [router, searchParams],
  )

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your customer accounts and organizations.
          </p>
        </div>
        <AccountForm
          industries={industries}
          users={users}
          createAction={createAction}
          onSuccess={() => {
            const params = new URLSearchParams(searchParams.toString())
            router.push(`/accounts?${params.toString()}`)
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            className="pl-8"
            defaultValue={currentQ}
            onChange={(e) => {
              const value = e.target.value
              clearTimeout(searchTimer.current)
              searchTimer.current = setTimeout(() => {
                navigateWithParams({ q: value || undefined, page: "1" })
              }, 300)
            }}
            onBlur={(e) => {
              clearTimeout(searchTimer.current)
              navigateWithParams({ q: e.target.value || undefined, page: "1" })
            }}
          />
        </div>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={currentIndustry}
          onChange={(e) =>
            navigateWithParams({
              industry: e.target.value || undefined,
              page: "1",
            })
          }
        >
          <option value="">All industries</option>
          {industries.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>

      {accounts.length === 0 ? (
        <Card className="flex flex-1 items-center justify-center">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Building2 className="size-10 text-muted-foreground" />
            <div>
              <h2 className="text-base font-medium">No accounts found</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {currentQ || currentIndustry
                  ? "Try adjusting your search or filters."
                  : "Accounts will appear here once they are created."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow
                    key={account.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/accounts/${account.id}`)}
                  >
                    <TableCell className="font-medium">
                      {account.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.industry ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.country ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.website ? (
                        <a
                          href={account.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-foreground hover:underline"
                        >
                          {(() => { try { return new URL(account.website).hostname } catch { return account.website } })()}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.ownerName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {from}–{to} of {totalCount} accounts
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={page <= 1}
                onClick={() =>
                  navigateWithParams({ page: String(page - 1) })
                }
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={page >= totalPages}
                onClick={() =>
                  navigateWithParams({ page: String(page + 1) })
                }
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
