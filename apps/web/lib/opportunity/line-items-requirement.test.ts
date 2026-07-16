import { describe, it, expect } from "vitest"
import {
  lineItemsRequiredAtStage,
  lineItemsRequirementUnmet,
} from "./line-items-requirement"

const from = (requiredFromStage: Parameters<typeof lineItemsRequiredAtStage>[1]["requiredFromStage"], overrideExempts = true) =>
  ({ requiredFromStage, overrideExempts })

describe("lineItemsRequiredAtStage", () => {
  it("is off when no stage is configured", () => {
    expect(lineItemsRequiredAtStage("verbal_agreement", from(null))).toBe(false)
  })

  it("is false before the configured stage, true at/after it", () => {
    expect(lineItemsRequiredAtStage("qualify", from("verbal_agreement"))).toBe(false)
    expect(lineItemsRequiredAtStage("negotiate", from("verbal_agreement"))).toBe(false)
    expect(lineItemsRequiredAtStage("verbal_agreement", from("verbal_agreement"))).toBe(true)
    expect(lineItemsRequiredAtStage("closed_won", from("verbal_agreement"))).toBe(true)
  })

  it("never applies to a lost deal", () => {
    expect(lineItemsRequiredAtStage("closed_lost", from("verbal_agreement"))).toBe(false)
    expect(lineItemsRequiredAtStage("closed_lost", from("qualify"))).toBe(false)
  })
})

describe("lineItemsRequirementUnmet", () => {
  const base = { stage: "verbal_agreement" as const, hasLineItems: false, amountOverridden: false }

  it("is unmet at the stage with no lines", () => {
    expect(lineItemsRequirementUnmet({ ...base, config: from("verbal_agreement") })).toBe(true)
  })

  it("is met once lines exist", () => {
    expect(
      lineItemsRequirementUnmet({ ...base, hasLineItems: true, config: from("verbal_agreement") }),
    ).toBe(false)
  })

  it("is not unmet before the stage", () => {
    expect(
      lineItemsRequirementUnmet({ ...base, stage: "propose", config: from("verbal_agreement") }),
    ).toBe(false)
  })

  it("honours the override exemption toggle", () => {
    // override exempts ON → waived
    expect(
      lineItemsRequirementUnmet({ ...base, amountOverridden: true, config: from("verbal_agreement", true) }),
    ).toBe(false)
    // override exempts OFF → still unmet
    expect(
      lineItemsRequirementUnmet({ ...base, amountOverridden: true, config: from("verbal_agreement", false) }),
    ).toBe(true)
  })

  it("is never unmet when the rule is off", () => {
    expect(lineItemsRequirementUnmet({ ...base, config: from(null) })).toBe(false)
  })
})
