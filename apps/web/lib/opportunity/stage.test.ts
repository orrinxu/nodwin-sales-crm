import { describe, it, expect } from "vitest"
import {
  DEAL_STAGES,
  TERMINAL_STAGES,
  NON_TERMINAL_STAGES,
  isTerminalStage,
  getNextStage,
  getPrevStage,
  checkStageTransition,
  assertStageTransition,
  createTransitionDescriptor,
  type DealStage,
} from "./stage"

describe("constants", () => {
  it("should have correct DEAL_STAGES order", () => {
    expect(DEAL_STAGES).toEqual([
      "qualify",
      "meet_and_present",
      "propose",
      "negotiate",
      "verbal_agreement",
      "closed_won",
      "closed_lost",
    ])
  })

  it("should define TERMINAL_STAGES correctly", () => {
    expect(TERMINAL_STAGES).toEqual(["closed_won", "closed_lost"])
  })

  it("should define NON_TERMINAL_STAGES correctly", () => {
    expect(NON_TERMINAL_STAGES).toEqual([
      "qualify",
      "meet_and_present",
      "propose",
      "negotiate",
      "verbal_agreement",
    ])
  })
})

describe("isTerminalStage", () => {
  it("should return true for terminal stages", () => {
    expect(isTerminalStage("closed_won")).toBe(true)
    expect(isTerminalStage("closed_lost")).toBe(true)
  })

  it("should return false for non-terminal stages", () => {
    expect(isTerminalStage("qualify")).toBe(false)
    expect(isTerminalStage("meet_and_present")).toBe(false)
    expect(isTerminalStage("propose")).toBe(false)
    expect(isTerminalStage("negotiate")).toBe(false)
    expect(isTerminalStage("verbal_agreement")).toBe(false)
  })
})

describe("getNextStage", () => {
  it("should return the next stage in order", () => {
    expect(getNextStage("qualify")).toBe("meet_and_present")
    expect(getNextStage("meet_and_present")).toBe("propose")
    expect(getNextStage("propose")).toBe("negotiate")
    expect(getNextStage("negotiate")).toBe("verbal_agreement")
    expect(getNextStage("verbal_agreement")).toBe("closed_won")
  })

  it("should return undefined for terminal stages", () => {
    expect(getNextStage("closed_won")).toBeUndefined()
    expect(getNextStage("closed_lost")).toBeUndefined()
  })
})

describe("getPrevStage", () => {
  it("should return the previous stage in order", () => {
    expect(getPrevStage("meet_and_present")).toBe("qualify")
    expect(getPrevStage("propose")).toBe("meet_and_present")
    expect(getPrevStage("negotiate")).toBe("propose")
    expect(getPrevStage("verbal_agreement")).toBe("negotiate")
    expect(getPrevStage("closed_won")).toBe("verbal_agreement")
    expect(getPrevStage("closed_lost")).toBe("closed_won")
  })

  it("should return undefined for the first stage", () => {
    expect(getPrevStage("qualify")).toBeUndefined()
  })
})

describe("checkStageTransition — same stage (no-op)", () => {
  it("should allow same-stage transition", () => {
    for (const stage of DEAL_STAGES) {
      const result = checkStageTransition(stage, stage)
      expect(result.allowed).toBe(true)
    }
  })
})

describe("checkStageTransition — admin override", () => {
  it("should allow any transition for admin role", () => {
    const fromStages: DealStage[] = ["qualify", "closed_won", "closed_lost"]
    const toStages: DealStage[] = [
      "qualify",
      "meet_and_present",
      "propose",
      "negotiate",
      "verbal_agreement",
      "closed_won",
      "closed_lost",
    ]

    for (const from of fromStages) {
      for (const to of toStages) {
        const result = checkStageTransition(from, to, "admin")
        expect(result.allowed).toBe(true)
      }
    }
  })
})

describe("checkStageTransition — from terminal stage", () => {
  it("should allow reopen to any non-terminal stage", () => {
    const terminalStages: DealStage[] = ["closed_won", "closed_lost"]
    for (const from of terminalStages) {
      for (const to of NON_TERMINAL_STAGES) {
        const result = checkStageTransition(from, to)
        expect(result.allowed).toBe(true)
      }
    }
  })

  it("should reject transition from terminal to terminal", () => {
    expect(
      checkStageTransition("closed_won", "closed_lost").allowed,
    ).toBe(false)
    expect(
      checkStageTransition("closed_lost", "closed_won").allowed,
    ).toBe(false)
  })
})

describe("checkStageTransition — to closed_lost", () => {
  it("should allow closed_lost from any non-terminal stage", () => {
    for (const from of NON_TERMINAL_STAGES) {
      const result = checkStageTransition(from, "closed_lost")
      expect(result.allowed).toBe(true)
    }
  })
})

describe("checkStageTransition — forward moves", () => {
  it("should allow advancing forward any number of stages", () => {
    const testCases: [DealStage, DealStage][] = [
      ["qualify", "meet_and_present"],
      ["qualify", "propose"],
      ["qualify", "verbal_agreement"],
      ["meet_and_present", "negotiate"],
      ["propose", "closed_won"],
      ["negotiate", "verbal_agreement"],
    ]
    for (const [from, to] of testCases) {
      const result = checkStageTransition(from, to)
      expect(result.allowed).toBe(true)
    }
  })
})

describe("checkStageTransition — backward moves", () => {
  it("should allow exactly one step backward", () => {
    const testCases: [DealStage, DealStage][] = [
      ["meet_and_present", "qualify"],
      ["propose", "meet_and_present"],
      ["negotiate", "propose"],
      ["verbal_agreement", "negotiate"],
    ]
    for (const [from, to] of testCases) {
      const result = checkStageTransition(from, to)
      expect(result.allowed).toBe(true)
    }
  })

  it("should reject non-terminal backward moves of more than one step", () => {
    const testCases: [DealStage, DealStage][] = [
      ["meet_and_present", "qualify"],
      ["propose", "qualify"],
      ["negotiate", "meet_and_present"],
      ["verbal_agreement", "propose"],
    ]
    for (const [from, to] of testCases) {
      if (isTerminalStage(from)) continue
      const result = checkStageTransition(from, to)
      if (DEAL_STAGES.indexOf(from) - DEAL_STAGES.indexOf(to) > 1) {
        expect(result.allowed).toBe(false)
      }
    }
  })

  it("should reject terminal-to-terminal transitions (not reopen)", () => {
    expect(checkStageTransition("closed_won", "closed_lost").allowed).toBe(false)
    expect(checkStageTransition("closed_lost", "closed_won").allowed).toBe(false)
  })

  it("should reject backward from qualify (no prev stage)", () => {
    expect(checkStageTransition("qualify", "closed_lost").allowed).toBe(true)
    expect(checkStageTransition("qualify", "meet_and_present").allowed).toBe(true)
  })
})

describe("checkStageTransition — illegal transitions", () => {
  it("should return a reason for illegal transitions", () => {
    const result = checkStageTransition("propose", "qualify")
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain("propose")
    expect(result.reason).toContain("qualify")
  })

  it("should return a terminal-stage reason for terminal transitions", () => {
    const result = checkStageTransition("closed_won", "closed_lost")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("terminal")
    expect(result.reason).toContain("closed_won")
  })
})

describe("assertStageTransition", () => {
  it("should not throw for allowed transitions", () => {
    expect(() =>
      assertStageTransition("qualify", "meet_and_present"),
    ).not.toThrow()
    expect(() =>
      assertStageTransition("qualify", "closed_lost"),
    ).not.toThrow()
    expect(() =>
      assertStageTransition("closed_won", "qualify", "admin"),
    ).not.toThrow()
  })

  it("should throw for illegal transitions", () => {
    expect(() =>
      assertStageTransition("propose", "qualify"),
    ).toThrow("Illegal stage transition")
  })
})

describe("createTransitionDescriptor", () => {
  it("should create a descriptor with from, to, and event", () => {
    const desc = createTransitionDescriptor(
      "qualify",
      "meet_and_present",
      "ADVANCE",
    )
    expect(desc.from).toBe("qualify")
    expect(desc.to).toBe("meet_and_present")
    expect(desc.event).toBe("ADVANCE")
    expect(desc.reason).toBeUndefined()
  })

  it("should include reason when provided", () => {
    const desc = createTransitionDescriptor(
      "closed_won",
      "negotiate",
      "REOPEN",
      "Customer wants to renegotiate",
    )
    expect(desc.reason).toBe("Customer wants to renegotiate")
  })
})

describe("checkStageTransition — edge cases", () => {
  it("should handle full forward from qualify to closed_won", () => {
    let current: DealStage = "qualify"
    const path: DealStage[] = [current]
    while (true) {
      const next = getNextStage(current)
      if (!next) break
      expect(checkStageTransition(current, next).allowed).toBe(true)
      current = next
      path.push(current)
    }
    expect(path).toEqual([
      "qualify",
      "meet_and_present",
      "propose",
      "negotiate",
      "verbal_agreement",
      "closed_won",
    ])
  })

  it("should handle close-lost then reopen cycle", () => {
    expect(checkStageTransition("qualify", "closed_lost").allowed).toBe(true)
    expect(
      checkStageTransition("closed_lost", "qualify").allowed,
    ).toBe(true)
    expect(
      checkStageTransition("closed_lost", "closed_won").allowed,
    ).toBe(false)
  })

  it("should reject skip-backward from verbal_agreement to propose", () => {
    expect(
      checkStageTransition("verbal_agreement", "propose").allowed,
    ).toBe(false)
  })

  it("should reject skip-backward from negotiate to qualify", () => {
    expect(
      checkStageTransition("negotiate", "qualify").allowed,
    ).toBe(false)
  })
})
