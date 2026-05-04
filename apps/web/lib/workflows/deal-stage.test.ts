import { describe, it, expect } from "vitest"
import { createActor } from "xstate"
import {
  DEAL_STAGES,
  STAGE_ORDER,
  TERMINAL_STAGES,
  NON_TERMINAL_STAGES,
  isTerminalStage,
  getNextStage,
  getPrevStage,
  dealStageMachine,
  type DealStage,
  type NonTerminalDealStage,
  type StageHistoryEntry,
} from "./deal-stage"

function createDealActor() {
  const actor = createActor(dealStageMachine)
  actor.start()
  return actor
}

function getCurrentStage(actor: ReturnType<typeof createDealActor>): DealStage {
  return actor.getSnapshot().context.currentStage
}

function getHistory(
  actor: ReturnType<typeof createDealActor>,
): StageHistoryEntry[] {
  return actor.getSnapshot().context.stageHistory
}

function sendAndGetStage(
  actor: ReturnType<typeof createDealActor>,
  event: Parameters<typeof actor.send>[0],
): DealStage {
  actor.send(event as any)
  return getCurrentStage(actor)
}

describe("DealStage constants and helpers", () => {
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

  it("should have correct STAGE_ORDER mapping", () => {
    expect(STAGE_ORDER.qualify).toBe(0)
    expect(STAGE_ORDER.meet_and_present).toBe(1)
    expect(STAGE_ORDER.propose).toBe(2)
    expect(STAGE_ORDER.negotiate).toBe(3)
    expect(STAGE_ORDER.verbal_agreement).toBe(4)
    expect(STAGE_ORDER.closed_won).toBe(5)
    expect(STAGE_ORDER.closed_lost).toBe(6)
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

  it("isTerminalStage should return true for terminal stages", () => {
    expect(isTerminalStage("closed_won")).toBe(true)
    expect(isTerminalStage("closed_lost")).toBe(true)
  })

  it("isTerminalStage should return false for non-terminal stages", () => {
    expect(isTerminalStage("qualify")).toBe(false)
    expect(isTerminalStage("meet_and_present")).toBe(false)
    expect(isTerminalStage("propose")).toBe(false)
    expect(isTerminalStage("negotiate")).toBe(false)
    expect(isTerminalStage("verbal_agreement")).toBe(false)
  })

  it("getNextStage should return the next stage", () => {
    expect(getNextStage("qualify")).toBe("meet_and_present")
    expect(getNextStage("meet_and_present")).toBe("propose")
    expect(getNextStage("propose")).toBe("negotiate")
    expect(getNextStage("negotiate")).toBe("verbal_agreement")
    expect(getNextStage("verbal_agreement")).toBe("closed_won")
    expect(getNextStage("closed_won")).toBeUndefined()
  })

  it("getNextStage should return undefined for the last stage", () => {
    expect(getNextStage("closed_lost")).toBeUndefined()
  })

  it("getPrevStage should return the previous stage", () => {
    expect(getPrevStage("meet_and_present")).toBe("qualify")
    expect(getPrevStage("propose")).toBe("meet_and_present")
    expect(getPrevStage("negotiate")).toBe("propose")
    expect(getPrevStage("verbal_agreement")).toBe("negotiate")
    expect(getPrevStage("closed_won")).toBe("verbal_agreement")
    expect(getPrevStage("closed_lost")).toBe("closed_won")
  })

  it("getPrevStage should return undefined for the first stage", () => {
    expect(getPrevStage("qualify")).toBeUndefined()
  })
})

describe("DealStage machine: initial state", () => {
  it("should start in qualify stage", () => {
    const actor = createDealActor()
    expect(getCurrentStage(actor)).toBe("qualify")
  })

  it("should start with empty stage history", () => {
    const actor = createDealActor()
    expect(getHistory(actor)).toEqual([])
  })
})

describe("DealStage machine: ADVANCE", () => {
  it("should advance from qualify to meet_and_present", () => {
    const actor = createDealActor()
    const stage = sendAndGetStage(actor, { type: "ADVANCE" })
    expect(stage).toBe("meet_and_present")
  })

  it("should advance through all stages to closed_won", () => {
    const actor = createDealActor()
    const stages: DealStage[] = []
    for (let i = 0; i < 5; i++) {
      actor.send({ type: "ADVANCE" })
      stages.push(getCurrentStage(actor))
    }
    expect(stages).toEqual([
      "meet_and_present",
      "propose",
      "negotiate",
      "verbal_agreement",
      "closed_won",
    ])
  })

  it("should record history on every advance", () => {
    const actor = createDealActor()
    actor.send({ type: "ADVANCE" })
    const history = getHistory(actor)
    expect(history).toHaveLength(1)
    expect(history[0].from).toBe("qualify")
    expect(history[0].to).toBe("meet_and_present")
    expect(history[0].event).toBe("ADVANCE")
    expect(history[0].timestamp).toBeDefined()
  })
})

describe("DealStage machine: MOVE_BACKWARD", () => {
  it("should move backward from meet_and_present to qualify", () => {
    const actor = createDealActor()
    actor.send({ type: "ADVANCE" })
    expect(getCurrentStage(actor)).toBe("meet_and_present")
    const stage = sendAndGetStage(actor, { type: "MOVE_BACKWARD" })
    expect(stage).toBe("qualify")
  })

  it("should record history on backward move", () => {
    const actor = createDealActor()
    actor.send({ type: "ADVANCE" })
    actor.send({ type: "MOVE_BACKWARD" })
    const history = getHistory(actor)
    expect(history).toHaveLength(2)
    expect(history[1].from).toBe("meet_and_present")
    expect(history[1].to).toBe("qualify")
    expect(history[1].event).toBe("MOVE_BACKWARD")
  })

  it("should not move backward from qualify (no MOVE_BACKWARD handler)", () => {
    const actor = createDealActor()
    expect(getCurrentStage(actor)).toBe("qualify")
    actor.send({ type: "MOVE_BACKWARD" })
    expect(getCurrentStage(actor)).toBe("qualify")
  })
})

describe("DealStage machine: CLOSE_WON", () => {
  it("should transition to closed_won from any non-terminal stage", () => {
    const stage = sendAndGetStage(createDealActor(), { type: "CLOSE_WON" })
    expect(stage).toBe("closed_won")
  })

  it("should record history on CLOSE_WON", () => {
    const actor = createDealActor()
    actor.send({ type: "CLOSE_WON" })
    const history = getHistory(actor)
    expect(history).toHaveLength(1)
    expect(history[0].from).toBe("qualify")
    expect(history[0].to).toBe("closed_won")
    expect(history[0].event).toBe("CLOSE_WON")
  })

  it("should transition to closed_won from verbal_agreement", () => {
    const actor = createDealActor()
    for (let i = 0; i < 4; i++) {
      actor.send({ type: "ADVANCE" })
    }
    expect(getCurrentStage(actor)).toBe("verbal_agreement")
    const stage = sendAndGetStage(actor, { type: "CLOSE_WON" })
    expect(stage).toBe("closed_won")
  })
})

describe("DealStage machine: CLOSE_LOST", () => {
  it("should transition to closed_lost from any non-terminal stage", () => {
    const stage = sendAndGetStage(createDealActor(), { type: "CLOSE_LOST" })
    expect(stage).toBe("closed_lost")
  })

  it("should record history on CLOSE_LOST", () => {
    const actor = createDealActor()
    actor.send({ type: "CLOSE_LOST" })
    const history = getHistory(actor)
    expect(history).toHaveLength(1)
    expect(history[0].from).toBe("qualify")
    expect(history[0].to).toBe("closed_lost")
    expect(history[0].event).toBe("CLOSE_LOST")
  })

  it("should transition to closed_lost from negotiate", () => {
    const actor = createDealActor()
    for (let i = 0; i < 3; i++) {
      actor.send({ type: "ADVANCE" })
    }
    expect(getCurrentStage(actor)).toBe("negotiate")
    const stage = sendAndGetStage(actor, { type: "CLOSE_LOST" })
    expect(stage).toBe("closed_lost")
  })
})

describe("DealStage machine: REOPEN", () => {
  it("should reopen from closed_won to a non-terminal stage", () => {
    const actor = createDealActor()
    actor.send({ type: "CLOSE_WON" })
    expect(getCurrentStage(actor)).toBe("closed_won")
    const stage = sendAndGetStage(actor, {
      type: "REOPEN",
      stage: "negotiate" as NonTerminalDealStage,
      reason: "Customer wants to renegotiate",
    })
    expect(stage).toBe("negotiate")
  })

  it("should reopen from closed_lost to a non-terminal stage", () => {
    const actor = createDealActor()
    actor.send({ type: "CLOSE_LOST" })
    expect(getCurrentStage(actor)).toBe("closed_lost")
    const stage = sendAndGetStage(actor, {
      type: "REOPEN",
      stage: "qualify" as NonTerminalDealStage,
      reason: "Customer came back",
    })
    expect(stage).toBe("qualify")
  })

  it("should record history on REOPEN with reason", () => {
    const actor = createDealActor()
    actor.send({ type: "CLOSE_WON" })
    const reason = "Reopened for additional negotiation"
    actor.send({
      type: "REOPEN",
      stage: "verbal_agreement" as NonTerminalDealStage,
      reason,
    })
    const history = getHistory(actor)
    const reopenEntry = history[history.length - 1]
    expect(reopenEntry.from).toBe("closed_won")
    expect(reopenEntry.to).toBe("verbal_agreement")
    expect(reopenEntry.event).toBe("REOPEN")
    expect(reopenEntry.reason).toBe(reason)
  })

  it("should allow advancing again after reopen", () => {
    const actor = createDealActor()
    actor.send({ type: "CLOSE_WON" })
    actor.send({
      type: "REOPEN",
      stage: "negotiate" as NonTerminalDealStage,
      reason: "Reopen",
    })
    expect(getCurrentStage(actor)).toBe("negotiate")
    const stage = sendAndGetStage(actor, { type: "ADVANCE" })
    expect(stage).toBe("verbal_agreement")
  })
})

describe("DealStage machine: FORCE_STAGE", () => {
  it("should force transition to any stage with a reason", () => {
    const actor = createDealActor()
    const stage = sendAndGetStage(actor, {
      type: "FORCE_STAGE",
      stage: "closed_won",
      reason: "Admin override",
    })
    expect(stage).toBe("closed_won")
  })

  it("should skip stages via FORCE_STAGE", () => {
    const actor = createDealActor()
    const stage = sendAndGetStage(actor, {
      type: "FORCE_STAGE",
      stage: "verbal_agreement",
      reason: "Skipping ahead",
    })
    expect(stage).toBe("verbal_agreement")
  })

  it("should record history on FORCE_STAGE with reason", () => {
    const actor = createDealActor()
    actor.send({
      type: "FORCE_STAGE",
      stage: "negotiate",
      reason: "Admin bypass",
    })
    const history = getHistory(actor)
    expect(history).toHaveLength(1)
    expect(history[0].from).toBe("qualify")
    expect(history[0].to).toBe("negotiate")
    expect(history[0].event).toBe("FORCE_STAGE")
    expect(history[0].reason).toBe("Admin bypass")
  })

  it("should work from any current stage", () => {
    const actor = createDealActor()
    actor.send({ type: "ADVANCE" })
    actor.send({ type: "ADVANCE" })
    expect(getCurrentStage(actor)).toBe("propose")
    const stage = sendAndGetStage(actor, {
      type: "FORCE_STAGE",
      stage: "qualify",
      reason: "Reset",
    })
    expect(stage).toBe("qualify")
  })
})

describe("DealStage machine: full lifecycle", () => {
  it("should track a complete happy path with history", () => {
    const actor = createDealActor()
    const expectedStages: DealStage[] = [
      "meet_and_present",
      "propose",
      "negotiate",
      "verbal_agreement",
      "closed_won",
    ]
    for (const expected of expectedStages) {
      actor.send({ type: "ADVANCE" })
      expect(getCurrentStage(actor)).toBe(expected)
    }
    expect(getHistory(actor)).toHaveLength(5)
    const toStages = getHistory(actor).map((h) => h.to)
    expect(toStages).toEqual(expectedStages)
  })

  it("should handle close-lost then reopen and close-won", () => {
    const actor = createDealActor()
    actor.send({ type: "ADVANCE" })
    actor.send({ type: "ADVANCE" })
    actor.send({ type: "CLOSE_LOST" })
    expect(getCurrentStage(actor)).toBe("closed_lost")
    actor.send({
      type: "REOPEN",
      stage: "qualify",
      reason: "Lost deal reopened",
    })
    expect(getCurrentStage(actor)).toBe("qualify")
    for (let i = 0; i < 5; i++) {
      actor.send({ type: "ADVANCE" })
    }
    expect(getCurrentStage(actor)).toBe("closed_won")
    expect(getHistory(actor)).toHaveLength(9)
  })

  it("should verify the match snapshot matcher works with value", () => {
    const actor = createDealActor()
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe("qualify")
  })
})
