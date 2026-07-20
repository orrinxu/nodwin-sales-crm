import { describe, it, expect } from "vitest"

import { buildConversionFunnel, FUNNEL_STAGES } from "./conversion-funnel"

describe("buildConversionFunnel", () => {
  it("cumulates reached counts from the tail of the funnel", () => {
    const d = buildConversionFunnel({
      qualify: 10,
      meet_and_present: 8,
      propose: 6,
      negotiate: 4,
      verbal_agreement: 2,
      closed_won: 1,
      closed_lost: 3,
    })
    const reached = Object.fromEntries(d.stages.map((s) => [s.stage, s.reached]))
    // Each stage = sum of its own current count + every later funnel stage.
    expect(reached.qualify).toBe(31) // 10+8+6+4+2+1
    expect(reached.meet_and_present).toBe(21)
    expect(reached.propose).toBe(13)
    expect(reached.negotiate).toBe(7)
    expect(reached.verbal_agreement).toBe(3)
    expect(reached.closed_won).toBe(1)

    expect(d.topCount).toBe(31)
    expect(d.wonCount).toBe(1)
    expect(d.lostCount).toBe(3)
    // enteredCount folds lost back in: 31 funnel-bar deals + 3 lost = 34.
    expect(d.enteredCount).toBe(34)
    // overall = won ÷ entered = round(1/34 × 100), NOT won ÷ topCount (ORR-813).
    expect(d.overallConversion).toBe(3)
  })

  it("counts lost in the entered denominator so conversion can't exceed 100% (ORR-813)", () => {
    // 10 entered, 9 lost, 1 won. The old won÷topCount reported 100% overall
    // (1 won ÷ 1 funnel-bar deal); the honest denominator includes the 9 lost.
    const d = buildConversionFunnel({ closed_won: 1, closed_lost: 9 })
    expect(d.topCount).toBe(1) // only the won deal is on a funnel bar
    expect(d.lostCount).toBe(9)
    expect(d.enteredCount).toBe(10)
    expect(d.overallConversion).toBe(10) // round(1/10 × 100), not 100
  })

  it("computes pctOfTop and step conversion as whole percentages", () => {
    const d = buildConversionFunnel({ qualify: 100, propose: 50, closed_won: 25 })
    // reached: qualify=175, meet=75, propose=75, negotiate=25, verbal=25, won=25
    const qualify = d.stages.find((s) => s.stage === "qualify")!
    expect(qualify.conversionFromPrev).toBeNull()
    expect(qualify.pctOfTop).toBe(100)

    const meet = d.stages.find((s) => s.stage === "meet_and_present")!
    expect(meet.reached).toBe(75)
    expect(meet.pctOfTop).toBe(43) // round(75/175 × 100)
    expect(meet.conversionFromPrev).toBe(43)

    expect(d.stages.find((s) => s.stage === "closed_won")!.reached).toBe(25)
  })

  it("handles an empty funnel without dividing by zero", () => {
    const d = buildConversionFunnel({})
    expect(d.topCount).toBe(0)
    expect(d.enteredCount).toBe(0)
    expect(d.wonCount).toBe(0)
    expect(d.overallConversion).toBe(0)
    for (const s of d.stages) {
      expect(s.reached).toBe(0)
      expect(s.pctOfTop).toBe(0)
    }
    expect(d.stages[0].conversionFromPrev).toBeNull()
  })

  it("excludes closed_lost from the funnel bars but surfaces it as context", () => {
    const d = buildConversionFunnel({ qualify: 5, closed_lost: 99 })
    expect(d.stages.map((s) => s.stage)).toEqual([...FUNNEL_STAGES])
    expect(d.stages.map((s) => s.stage as string)).not.toContain("closed_lost")
    expect(d.topCount).toBe(5) // lost deals never enter the reached series (bars)
    expect(d.lostCount).toBe(99)
    // ...but they DID enter the funnel, so the honest entered total includes them.
    expect(d.enteredCount).toBe(104)
  })
})
