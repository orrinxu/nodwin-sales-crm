import { describe, it, expect } from "vitest"
import {
  findMissingRequiredFields,
  isCustomFieldValueEmpty,
  type FieldDefinition,
} from "./field-definitions.types"

function def(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: overrides.key ?? "id",
    entityType: "opportunity",
    key: "field",
    label: "Field",
    dataType: "text",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 0,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("isCustomFieldValueEmpty", () => {
  it("treats null/undefined/blank string/empty array as empty", () => {
    expect(isCustomFieldValueEmpty(null)).toBe(true)
    expect(isCustomFieldValueEmpty(undefined)).toBe(true)
    expect(isCustomFieldValueEmpty("")).toBe(true)
    expect(isCustomFieldValueEmpty("   ")).toBe(true)
    expect(isCustomFieldValueEmpty([])).toBe(true)
  })

  it("treats meaningful values as present", () => {
    expect(isCustomFieldValueEmpty("x")).toBe(false)
    expect(isCustomFieldValueEmpty(0)).toBe(false)
    expect(isCustomFieldValueEmpty(false)).toBe(false)
    expect(isCustomFieldValueEmpty(["a"])).toBe(false)
  })
})

describe("findMissingRequiredFields", () => {
  const region = def({ key: "region", label: "Region", required: true })
  const notes = def({ key: "notes", label: "Notes", required: false })

  it("returns required fields with no value", () => {
    const missing = findMissingRequiredFields([region, notes], {})
    expect(missing.map((d) => d.key)).toEqual(["region"])
  })

  it("returns nothing once the required field has a value", () => {
    expect(findMissingRequiredFields([region, notes], { region: "APAC" })).toEqual([])
  })

  it("ignores non-required and inactive required fields", () => {
    const inactive = def({ key: "legacy", label: "Legacy", required: true, active: false })
    expect(findMissingRequiredFields([notes, inactive], {})).toEqual([])
  })

  it("treats undefined customData as all-empty", () => {
    expect(findMissingRequiredFields([region], undefined).map((d) => d.key)).toEqual(["region"])
  })
})
