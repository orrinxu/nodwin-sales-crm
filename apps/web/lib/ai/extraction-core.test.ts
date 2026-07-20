import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { z } from "zod"
import { salvageObject, retryNudge, field } from "./extraction-core"

// ORR-808 (e): one malformed field must no longer discard all the valid ones.
const schema = z.object({
  name: field(z.string().min(1).max(50)).optional(),
  amount: field(z.union([z.string(), z.number()]).transform((v) => String(v))).optional(),
  recurring: field(z.boolean()).optional(),
})

describe("salvageObject (per-field extraction salvage)", () => {
  it("keeps valid fields and drops only the malformed one", () => {
    const raw = {
      name: { value: "Acme Deal", confidence: 0.9, source: "subject" },
      // over-long source: invalid → must be dropped, not fatal to the whole object
      recurring: { value: "true", confidence: 0.8, source: "x".repeat(5000) },
      amount: { value: 50000, confidence: 0.7, source: "budget" },
    }
    const { data, fieldCount } = salvageObject(schema, raw)
    expect(fieldCount).toBe(2)
    expect(data).toBeDefined()
    expect(data!.name?.value).toBe("Acme Deal")
    expect(data!.amount?.value).toBe("50000")
    expect(data!.recurring).toBeUndefined()
  })

  it("returns the full object untouched when everything is valid", () => {
    const raw = {
      name: { value: "Deal", confidence: 1, source: "s" },
      recurring: { value: true, confidence: 1, source: "s" },
    }
    const { data, fieldCount } = salvageObject(schema, raw)
    expect(fieldCount).toBe(2)
    expect(data!.recurring?.value).toBe(true)
  })

  it("reports zero fields when nothing is salvageable", () => {
    const raw = { name: { value: "", confidence: 0.5, source: "s" } } // empty name invalid
    const { data, fieldCount } = salvageObject(schema, raw)
    expect(fieldCount).toBe(0)
    expect(data).toBeDefined() // an empty (but valid) object
  })

  it("returns no data for a non-object input", () => {
    expect(salvageObject(schema, "not json").data).toBeUndefined()
    expect(salvageObject(schema, null).data).toBeUndefined()
  })
})

describe("retryNudge (accurate corrective feedback)", () => {
  it("asks for pure JSON when the reply was not JSON", () => {
    expect(retryNudge("json")).toMatch(/ONLY the JSON object/i)
    expect(retryNudge(null)).toMatch(/could not be parsed/i)
  })

  it("explains the field shape when JSON parsed but fields were malformed", () => {
    const nudge = retryNudge("shape")
    expect(nudge).toMatch(/valid JSON but the field shapes were wrong/i)
    expect(nudge).toMatch(/confidence/i)
    // must NOT claim the JSON was unparseable — that was the wrong old feedback
    expect(nudge).not.toMatch(/could not be parsed/i)
  })
})
