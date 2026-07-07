import { describe, it, expect } from "vitest"

import {
  buildSavedFilters,
  applySavedFilters,
  hasActiveFilterState,
  EMPTY_FILTER_STATE,
} from "./saved-views-filters"

describe("buildSavedFilters", () => {
  it("omits pristine defaults", () => {
    expect(buildSavedFilters(EMPTY_FILTER_STATE)).toEqual({})
  })

  it("includes only the dimensions that were set, and trims the search", () => {
    expect(
      buildSavedFilters({
        searchQuery: "  acme ",
        stageFilter: "all",
        ownerFilter: "u1",
        sorting: [],
      }),
    ).toEqual({ searchQuery: "acme", ownerFilter: "u1" })
  })

  it("includes stage and sorting when set", () => {
    expect(
      buildSavedFilters({
        searchQuery: "",
        stageFilter: "propose",
        ownerFilter: "all",
        sorting: [{ id: "amount", desc: true }],
      }),
    ).toEqual({ stageFilter: "propose", sorting: [{ id: "amount", desc: true }] })
  })
})

describe("applySavedFilters", () => {
  it("fills absent dimensions with defaults", () => {
    expect(applySavedFilters({ stageFilter: "negotiate" })).toEqual({
      searchQuery: "",
      stageFilter: "negotiate",
      ownerFilter: "all",
      sorting: [],
    })
  })

  it("round-trips a fully-set state through build → apply", () => {
    const state = {
      searchQuery: "acme",
      stageFilter: "propose",
      ownerFilter: "u1",
      sorting: [{ id: "name", desc: false }],
    }
    expect(applySavedFilters(buildSavedFilters(state))).toEqual(state)
  })
})

describe("hasActiveFilterState", () => {
  it("is false for pristine state", () => {
    expect(hasActiveFilterState(EMPTY_FILTER_STATE)).toBe(false)
  })

  it("is true when any dimension is set", () => {
    expect(hasActiveFilterState({ ...EMPTY_FILTER_STATE, searchQuery: "x" })).toBe(true)
    expect(hasActiveFilterState({ ...EMPTY_FILTER_STATE, stageFilter: "propose" })).toBe(true)
    expect(hasActiveFilterState({ ...EMPTY_FILTER_STATE, ownerFilter: "u1" })).toBe(true)
    expect(
      hasActiveFilterState({ ...EMPTY_FILTER_STATE, sorting: [{ id: "a", desc: true }] }),
    ).toBe(true)
  })
})
