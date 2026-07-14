"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LayoutGridIcon, ListIcon, KanbanIcon } from "lucide-react"

import { type OpportunityRecord } from "@/lib/data/opportunities.types"
import type {
  OpportunityCreateInput,
  BusinessUnitOption,
  EntityScopeOption,
} from "@/lib/data/opportunities.types"
import type { StageTotals } from "@/lib/data/stage-totals"
import type { AccountOption } from "@/lib/data/contacts"
import type { EntityOption } from "@/components/entity-combobox"
import type {
  SavedViewRecord,
  SavedViewFilters,
  SavedViewScope,
} from "@/lib/data/saved-views"
import {
  SCOPE_PRESET_ORDER,
  SCOPE_PRESETS,
  type OpportunityScopeKey,
} from "@/lib/opportunity/scope-presets"
import { cn } from "@/lib/utils"
import { SectionHeader } from "@/components/primitives/section-header"
import { EmptyState } from "@/components/primitives/empty-state"
import { OpportunityBoard } from "@/components/opportunities/opportunity-board"
import { OpportunityListTable } from "@/components/opportunities/opportunity-list-table"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { OpportunityGenerator } from "@/components/opportunities/opportunity-generator"
import type { GenerateOpportunityResult, ExtractFileResult } from "@/app/(crm)/opportunities/generate-actions"

interface OpportunitiesViewProps {
  /**
   * Active scope preset (ORR-711). When provided, the scope chips
   * (My Pipeline / All Deals / Closing This Month) render and drive the URL.
   */
  scope?: OpportunityScopeKey
  /**
   * Entity-scope chip options (ORR-717), auto-derived from the caller's visible
   * deals. Rendered as an "All / <entity>…" segmented control next to the scope
   * chips, but only when the caller can see deals across ≥2 entities — a
   * single-entity user (e.g. a rep) gets no entity control at all.
   */
  entityOptions?: EntityScopeOption[]
  /** Active `entity_sales_id` filter, or null for "All entities". */
  activeEntity?: string | null
  opportunities: OpportunityRecord[]
  /** FX-normalised per-stage totals for the board columns (count / value / weighted). */
  stageTotals?: StageTotals
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  /** ORR-677: when provided, "Create Opportunity" opens the AI generator chooser. */
  generateAction?: (input: { text: string }) => Promise<GenerateOpportunityResult>
  /** ORR-684: server-side text extraction for PDF/DOCX uploads in the generator. */
  extractFileAction?: (formData: FormData) => Promise<ExtractFileResult>
  updateStageAction: (id: string, input: { stage: string }) => Promise<OpportunityRecord>
  bulkDeleteAction: (input: { ids: string[] }) => Promise<void>
  bulkUpdateStageAction: (input: { ids: string[]; stage: string }) => Promise<void>
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
  searchContactsAction?: (query: string, accountId?: string) => Promise<EntityOption[]>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  createContactQuickAction?: (input: { fullName: string; email?: string; accountId?: string }) => Promise<EntityOption>
  createAccountQuickAction?: (input: { name: string }) => Promise<EntityOption>
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
  scope,
  entityOptions = [],
  activeEntity = null,
  opportunities,
  stageTotals,
  accounts,
  businessUnits,
  users,
  createAction,
  generateAction,
  extractFileAction,
  updateStageAction,
  bulkDeleteAction,
  bulkUpdateStageAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  createAccountQuickAction,
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

  // Toggling Board/Table stays instant (same data, no refetch) but syncs the
  // `view` query param so the choice survives reload / share — no navigation.
  function selectView(next: ViewMode) {
    setViewMode(next)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      params.set("view", next === "kanban" ? "board" : "table")
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`,
      )
    }
  }

  // Switching scope loads a different (scoped) list, so it's a real navigation.
  // The current view is preserved — scope and view are orthogonal — and so is
  // any active entity narrowing, so the two axes compose across a scope switch.
  function selectScope(next: OpportunityScopeKey) {
    if (next === scope) return
    const params = new URLSearchParams()
    params.set("scope", next)
    params.set("view", viewMode === "kanban" ? "board" : "table")
    if (activeEntity) params.set("entity", activeEntity)
    router.push(`/opportunities?${params.toString()}`)
  }

  // Entity narrowing (ORR-717) — another scoped list, so also a real navigation.
  // `null` clears the filter back to All entities. Scope + view are preserved.
  function selectEntity(next: string | null) {
    if (next === activeEntity) return
    const params = new URLSearchParams()
    if (scope != null) params.set("scope", scope)
    params.set("view", viewMode === "kanban" ? "board" : "table")
    if (next) params.set("entity", next)
    router.push(`/opportunities?${params.toString()}`)
  }

  const showEmptyState = emptyState != null && opportunities.length === 0

  // Single "Create Opportunity" entry, reused by the header (table view) and the
  // empty state so the create flow is identical everywhere. When a generateAction
  // is supplied it opens the AI generator chooser (ORR-677); otherwise the plain
  // create form. The kanban board renders its own equivalent internally.
  const createControl = generateAction ? (
    <OpportunityGenerator
      accounts={accounts}
      businessUnits={businessUnits}
      users={users}
      createAction={createAction}
      generateAction={generateAction}
      extractFileAction={extractFileAction}
      onSuccess={() => router.refresh()}
      searchAccountsAction={searchAccountsAction}
      searchContactsAction={searchContactsAction}
      searchUsersAction={searchUsersAction}
      createContactQuickAction={createContactQuickAction}
      createAccountQuickAction={createAccountQuickAction}
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
      createAccountQuickAction={createAccountQuickAction}
      defaultCurrency={defaultCurrency}
    />
  )

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
            <div className="flex flex-wrap items-center gap-3">
              {scope != null ? (
                <div className="flex items-center rounded-lg border p-0.5">
                  {SCOPE_PRESET_ORDER.map((key) => {
                    // eslint-disable-next-line security/detect-object-injection -- key iterates the constrained SCOPE_PRESET_ORDER union, not user input
                    const preset = SCOPE_PRESETS[key]
                    const active = key === scope
                    return (
                      <button
                        key={key}
                        onClick={() => selectScope(key)}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-muted text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {/* Entity-scope chips (ORR-717): only shown when the caller can see
                  deals across ≥2 entities, so single-entity users see nothing. */}
              {entityOptions.length >= 2 ? (
                <div className="flex items-center rounded-lg border p-0.5">
                  <button
                    onClick={() => selectEntity(null)}
                    aria-pressed={activeEntity == null}
                    className={cn(
                      "inline-flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      activeEntity == null
                        ? "bg-muted text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All Entities
                  </button>
                  {entityOptions.map((entity) => {
                    const active = entity.id === activeEntity
                    return (
                      <button
                        key={entity.id}
                        onClick={() => selectEntity(entity.id)}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-muted text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {entity.name}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <div className="flex items-center rounded-lg border p-0.5">
            <button
              onClick={() => selectView("kanban")}
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
              onClick={() => selectView("table")}
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
              {viewMode === "table" && !showEmptyState ? createControl : null}
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
            action={createControl}
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
          extractFileAction={extractFileAction}
          updateStageAction={updateStageAction}
          searchAccountsAction={searchAccountsAction}
          searchContactsAction={searchContactsAction}
          searchUsersAction={searchUsersAction}
          createContactQuickAction={createContactQuickAction}
          createAccountQuickAction={createAccountQuickAction}
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
