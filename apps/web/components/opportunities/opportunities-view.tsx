"use client"

import { useState } from "react"
import { LayoutGridIcon, ListIcon } from "lucide-react"

import { type OpportunityRecord } from "@/lib/data/opportunities.types"
import type { OpportunityCreateInput, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { AccountOption } from "@/lib/data/contacts"
import type { EntityOption } from "@/components/entity-combobox"
import { cn } from "@/lib/utils"
import { OpportunityBoard } from "@/components/opportunities/opportunity-board"
import { OpportunityListTable } from "@/components/opportunities/opportunity-list-table"

interface OpportunitiesViewProps {
  opportunities: OpportunityRecord[]
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  updateStageAction: (id: string, input: { stage: string }) => Promise<OpportunityRecord>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  bulkUpdateStageAction: (input: { ids: string[]; stage: string }) => Promise<void>
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
  searchContactsAction?: (query: string, accountId?: string) => Promise<EntityOption[]>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  createContactQuickAction?: (input: { fullName: string; email?: string; accountId?: string }) => Promise<EntityOption>
  defaultCurrency?: string
}

type ViewMode = "kanban" | "table"

export function OpportunitiesView({
  opportunities,
  accounts,
  businessUnits,
  users,
  createAction,
  updateStageAction,
  bulkDeleteAction,
  bulkUpdateStageAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  defaultCurrency,
}: OpportunitiesViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 lg:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Opportunities
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {viewMode === "kanban"
              ? "Drag opportunities between stages to update their pipeline status."
              : "View and manage all opportunities in a table."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                viewMode === "kanban"
                  ? "bg-muted text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGridIcon className="size-4" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                viewMode === "table"
                  ? "bg-muted text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ListIcon className="size-4" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <OpportunityBoard
          opportunities={opportunities}
          accounts={accounts}
          businessUnits={businessUnits}
          users={users}
          createAction={createAction}
          updateStageAction={updateStageAction}
          searchAccountsAction={searchAccountsAction}
          searchContactsAction={searchContactsAction}
          searchUsersAction={searchUsersAction}
          createContactQuickAction={createContactQuickAction}
          defaultCurrency={defaultCurrency}
        />
      ) : (
        <div className="flex-1 p-4 lg:p-6">
          <OpportunityListTable
            opportunities={opportunities}
            bulkDeleteAction={bulkDeleteAction}
            bulkUpdateStageAction={bulkUpdateStageAction}
          />
        </div>
      )}
    </div>
  )
}
