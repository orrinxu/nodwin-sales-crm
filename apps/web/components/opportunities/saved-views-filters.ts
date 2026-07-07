import type { SavedViewFilters } from "@/lib/data/saved-views"

/**
 * The subset of OpportunityListTable state a saved view captures and restores.
 * Kept here as a plain, pure module so the mapping between live table state and
 * the persisted {@link SavedViewFilters} is unit-testable and shared by the table
 * and the saved-views menu.
 */
export interface ListFilterState {
  searchQuery: string
  stageFilter: string
  ownerFilter: string
  sorting: { id: string; desc: boolean }[]
}

/** Defaults an empty/pristine table starts from — also what "clear filters" resets to. */
export const EMPTY_FILTER_STATE: ListFilterState = {
  searchQuery: "",
  stageFilter: "all",
  ownerFilter: "all",
  sorting: [],
}

/**
 * Serialize the live table state into a saved view, OMITTING pristine defaults so
 * a stored view only carries the dimensions the user actually set (a search-only
 * view has just `searchQuery`).
 */
export function buildSavedFilters(state: ListFilterState): SavedViewFilters {
  const filters: SavedViewFilters = {}
  const q = state.searchQuery.trim()
  if (q) filters.searchQuery = q
  if (state.stageFilter !== "all") filters.stageFilter = state.stageFilter
  if (state.ownerFilter !== "all") filters.ownerFilter = state.ownerFilter
  if (state.sorting.length > 0) filters.sorting = state.sorting
  return filters
}

/** Restore full table state from a saved view, filling any absent dimension with
 *  its default so applying a partial view clears the others. */
export function applySavedFilters(filters: SavedViewFilters): ListFilterState {
  return {
    searchQuery: filters.searchQuery ?? "",
    stageFilter: filters.stageFilter ?? "all",
    ownerFilter: filters.ownerFilter ?? "all",
    sorting: filters.sorting ?? [],
  }
}

/** Whether the live state differs from pristine — gates the "Save current view" action. */
export function hasActiveFilterState(state: ListFilterState): boolean {
  return (
    state.searchQuery.trim() !== "" ||
    state.stageFilter !== "all" ||
    state.ownerFilter !== "all" ||
    state.sorting.length > 0
  )
}
