"use client"

import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AccountDetail } from "@/components/accounts/account-detail"
import { AccountForm } from "@/components/accounts/account-form"
import type { AccountRecord, AccountCreateInput, AccountTreeData } from "@/lib/data/accounts"
import type { UserOption } from "@/lib/data/users"

interface AccountDetailWrapperProps {
  account: AccountRecord
  industries: string[]
  users: UserOption[]
  treeData?: AccountTreeData
  updateAction: (id: string, input: Partial<AccountCreateInput>) => Promise<AccountRecord>
}

export function AccountDetailWrapper({
  account,
  industries,
  users,
  treeData,
  updateAction,
}: AccountDetailWrapperProps) {
  const router = useRouter()

  return (
    <div className="relative">
      <div className="absolute top-6 right-6 z-10">
        <AccountForm
          account={account}
          industries={industries}
          users={users}
          createAction={async () => { throw new Error("Not available") }}
          updateAction={updateAction}
          onSuccess={() => {
            router.refresh()
          }}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="size-4" />
              Edit
            </Button>
          }
        />
      </div>
      <AccountDetail account={account} treeData={treeData} />
    </div>
  )
}
