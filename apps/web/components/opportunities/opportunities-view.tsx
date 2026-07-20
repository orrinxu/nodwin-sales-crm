"use client"

import dynamic from "next/dynamic"
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
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
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
// Code-split the two views (ORR-760): the board pulls in dnd-kit and the table
// pulls in tanstack-table, but only ONE renders per page load (the view is
// server-driven — toggling is a navigation), so dynamic-importing both keeps the
// non-rendered view's library out of the bundle. Default SSR is kept, so the
// active view still server-renders (no loading flash).
const OpportunityBoard = dynamic(() =>
  import("@/components/opportunities/opportunity-board").then((m) => m.OpportunityBoard),
)
const OpportunityListTable = dynamic(() =>
  import("@/components/opportunities/opportunity-list-table").then((m) => m.OpportunityListTable),
)
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { OpportunityGenerator } from "@/components/opportunities/opportunity-generator"
import type { GenerateOpportunityResult, ExtractFileResult, TranscribeAudioResult } from "@/app/(crm)/opportunities/generate-actions"

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
  /** Total rows matching the active filters/scope (server count). Table view uses
   *  it for pagination; board view uses it for the "showing N of M" note. */
  totalCount?: number
  /** 1-based page for the table view. */
  page?: number
  pageSize?: number
  /** Full owner list for the table's owner filter (server-supplied). */
  ownerOptions?: { id: string; name: string }[]
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  /** Admin-defined opportunity custom fields, rendered + enforced in the create dialog. */
  fieldDefinitions?: FieldDefinition[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  /** ORR-677: when provided, "Create Opportunity" opens the AI generator chooser. */
  generateAction?: (input: { text?: string; images?: { mimeType: string; dataBase64: string }[] }) => Promise<GenerateOpportunityResult>
  /** ORR-684: server-side text extraction for PDF/DOCX uploads in the generator. */
  extractFileAction?: (formData: FormData) => Promise<ExtractFileResult>
  /** ORR-745: voice transcription for the generator's record path. Present only
   *  when a transcription endpoint is configured. */
  transcribeAction?: (formData: FormData) => Promise<TranscribeAudioResult>
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
  totalCount = 0,
  page = 1,
  pageSize = 25,
  ownerOptions = [],
  accounts,
  businessUnits,
  users,
  fieldDefinitions,
  createAction,
  generateAction,
  extractFileAction,
  transcribeAction,
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
  // Server-driven (ORR-755): the board and table now fetch DIFFERENT data (the
  // board a bounded set + scoped totals, the table one paginated page), so the
  // rendered view follows the server `view` param rather than a client toggle.
  const viewMode: ViewMode = defaultView === "table" ? "table" : "kanban"

  // Switching Board/Table changes what the server must fetch, so it's a real
  // navigation. Scope + entity are preserved; the table's own filter/sort/page
  // reset (the board doesn't use them).
  function selectView(next: ViewMode) {
    if (next === viewMode) return
    const params = new URLSearchParams()
    if (scope != null) params.set("scope", scope)
    params.set("view", next === "kanban" ? "board" : "table")
    if (activeEntity) params.set("entity", activeEntity)
    router.push(`/opportunities?${params.toString()}`)
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

  // The dedicated empty state belongs to the board (personal Pipeline). In table
  // view a zero-row result is the table's own "no matches" body, so filtering to
  // an empty page never swaps in the big board empty state.
  const showEmptyState =
    emptyState != null && opportunities.length === 0 && viewMode === "kanban"

  // Single "Create Opportunity" entry, reused by the header (table view) and the
  // empty state so the create flow is identical everywhere. When a generateAction
  // is supplied it opens the AI generator chooser (ORR-677); otherwise the plain
  // create form. The kanban board renders its own equivalent internally.
  const createControl = generateAction ? (
    <OpportunityGenerator
      accounts={accounts}
      businessUnits={businessUnits}
      users={users}
      fieldDefinitions={fieldDefinitions}
      createAction={createAction}
      generateAction={generateAction}
      extractFileAction={extractFileAction}
      transcribeAction={transcribeAction}
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
      fieldDefinitions={fieldDefinitions}
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
          totalCount={totalCount}
          accounts={accounts}
          businessUnits={businessUnits}
          users={users}
          fieldDefinitions={fieldDefinitions}
          createAction={createAction}
          generateAction={generateAction}
          extractFileAction={extractFileAction}
          transcribeAction={transcribeAction}
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
            totalCount={totalCount}
            page={page}
            pageSize={pageSize}
            ownerOptions={ownerOptions}
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
