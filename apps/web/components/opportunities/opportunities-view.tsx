"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LayoutGridIcon, ListIcon, KanbanIcon } from "lucide-react"

import { type OpportunityRecord } from "@/lib/data/opportunities.types"
import type { OpportunityCreateInput, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { StageTotals } from "@/lib/data/stage-totals"
import type { AccountOption } from "@/lib/data/contacts"
import type { EntityOption } from "@/components/entity-combobox"
import type {
  SavedViewRecord,
  SavedViewFilters,
  SavedViewScope,
} from "@/lib/data/saved-views"
import { cn } from "@/lib/utils"
import { SectionHeader } from "@/components/primitives/section-header"
import { EmptyState } from "@/components/primitives/empty-state"
import { OpportunityBoard } from "@/components/opportunities/opportunity-board"
import { OpportunityListTable } from "@/components/opportunities/opportunity-list-table"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { OpportunityGenerator } from "@/components/opportunities/opportunity-generator"
import type { GenerateOpportunityResult } from "@/app/(crm)/opportunities/generate-actions"

interface OpportunitiesViewProps {
  opportunities: OpportunityRecord[]
  /** FX-normalised per-stage totals for the board columns (count / value / weighted). */
  stageTotals?: StageTotals
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  /** ORR-677: when provided, "Create Opportunity" opens the AI generator chooser. */
  generateAction?: (input: { text: string }) => Promise<GenerateOpportunityResult>
  updateStageAction: (id: string, input: { stage: string }) => Promise<OpportunityRecord>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  bulkUpdateStageAction: (input: { ids: string[]; stage: string }) => Promise<void>
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
  searchContactsAction?: (query: string, accountId?: string) => Promise<EntityOption[]>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  createContactQuickAction?: (input: { fullName: string; email?: string; accountId?: string }) => Promise<EntityOption>
  defaultCurrency?: string
  /** Which view to open on first render. Defaults to the board (kanban). */
  defaultView?: "board" | "table"
  /** Page header title. Defaults to "Opportunities". */
  title?: string
  /** Page header description. When omitted, a view-mode-aware default is used. */
  description?: string
  /**
   * Dedicated empty-state copy (title + optional description). When provided AND
   * there are no opportunities, a clean EmptyState — with the create action — is
   * shown instead of the board/table. Used by the personal Pipeline board; the
   * org-wide Opportunities list omits it and keeps its built-in empty rendering.
   */
  emptyState?: { title: string; description?: string }
  /** Saved-views support for the table view — passed straight to OpportunityListTable. */
  savedViews?: SavedViewRecord[]
  savedViewScope?: SavedViewScope
  saveViewAction?: (input: {
    name: string
    scope: SavedViewScope
    filters: SavedViewFilters
  }) => Promise<SavedViewRecord>
  deleteSavedViewAction?: (id: string) => Promise<void>
}

type ViewMode = "kanban" | "table"

export function OpportunitiesView({
  opportunities,
  stageTotals,
  accounts,
  businessUnits,
  users,
  createAction,
  generateAction,
  updateStageAction,
  bulkDeleteAction,
  bulkUpdateStageAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  defaultCurrency,
  defaultView = "board",
  title = "Opportunities",
  description,
  emptyState,
  savedViews,
  savedViewScope,
  saveViewAction,
  deleteSavedViewAction,
}: OpportunitiesViewProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>(
    defaultView === "table" ? "table" : "kanban",
  )

  const showEmptyState = emptyState != null && opportunities.length === 0

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b px-4 py-3 lg:px-6">
        <SectionHeader
          title={title}
          description={
            description ??
            (viewMode === "kanban"
              ? "Drag opportunities between stages to update their pipeline status."
              : "View and manage all opportunities in a table.")
          }
          actions={
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
          }
        />
      </div>

      {showEmptyState ? (
        <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
          <EmptyState
            icon={KanbanIcon}
            title={emptyState.title}
            description={emptyState.description}
            action={
              generateAction ? (
                <OpportunityGenerator
                  accounts={accounts}
                  businessUnits={businessUnits}
                  users={users}
                  createAction={createAction}
                  generateAction={generateAction}
                  onSuccess={() => router.refresh()}
                  searchAccountsAction={searchAccountsAction}
                  searchContactsAction={searchContactsAction}
                  searchUsersAction={searchUsersAction}
                  createContactQuickAction={createContactQuickAction}
                  defaultCurrency={defaultCurrency}
                />
              ) : (
                <OpportunityForm
                  accounts={accounts}
                  businessUnits={businessUnits}
                  users={users}
                  createAction={createAction}
                  onSuccess={() => router.refresh()}
                  searchAccountsAction={searchAccountsAction}
                  searchContactsAction={searchContactsAction}
                  searchUsersAction={searchUsersAction}
                  createContactQuickAction={createContactQuickAction}
                  defaultCurrency={defaultCurrency}
                />
              )
            }
          />
        </div>
      ) : viewMode === "kanban" ? (
        <OpportunityBoard
          opportunities={opportunities}
          stageTotals={stageTotals}
          accounts={accounts}
          businessUnits={businessUnits}
          users={users}
          createAction={createAction}
          generateAction={generateAction}
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
            savedViews={savedViews}
            savedViewScope={savedViewScope}
            saveViewAction={saveViewAction}
            deleteSavedViewAction={deleteSavedViewAction}
          />
        </div>
      )}
    </div>
  )
}
