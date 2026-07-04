import { describe, it, expect } from "vitest"
import { chunkText, chunkSegments, CHUNK_DEFAULTS } from "./chunk"

describe("chunkText", () => {
  it("returns nothing for empty / whitespace input", () => {
    expect(chunkText("")).toEqual([])
    expect(chunkText("   \n\n  ")).toEqual([])
  })

  it("returns a single chunk for short text", () => {
    const chunks = chunkText("A short proposal.")
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ index: 0, content: "A short proposal." })
  })

  it("splits long text into multiple sequentially-indexed chunks", () => {
    const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} in the deck.`).join(" ")
    const chunks = chunkText(text, { targetChars: 120, overlapChars: 30 })
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((c, i) => expect(c.index).toBe(i))
    // No chunk grossly exceeds the target window.
    chunks.forEach((c) => expect(c.content.length).toBeLessThanOrEqual(120 + 400))
  })

  it("produces overlapping windows", () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ")
    const chunks = chunkText(text, { targetChars: 80, overlapChars: 30 })
    expect(chunks.length).toBeGreaterThan(1)
    // The tail of one chunk should reappear near the head of the next.
    const firstTail = chunks[0].content.slice(-10)
    expect(chunks[1].content).toContain(firstTail.trim().split(" ").pop() as string)
  })

  it("uses sane defaults (~1000 tokens / 15% overlap)", () => {
    expect(CHUNK_DEFAULTS.targetChars).toBe(4000)
    expect(CHUNK_DEFAULTS.overlapChars).toBe(600)
  })
})

describe("chunkSegments", () => {
  it("preserves the page/slide ref onto each chunk", () => {
    const chunks = chunkSegments([
      { ref: "slide 1", text: "Intro slide." },
      { ref: "slide 2", text: "Second slide content." },
    ])
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ pageRef: "slide 1", index: 0 })
    expect(chunks[1]).toMatchObject({ pageRef: "slide 2", index: 1 })
  })

  it("re-numbers indices sequentially across segments", () => {
    const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n")
    const chunks = chunkSegments(
      [{ ref: "p.1", text: long }, { ref: "p.2", text: long }],
      { targetChars: 60, overlapChars: 10 },
    )
    chunks.forEach((c, i) => expect(c.index).toBe(i))
    expect(new Set(chunks.map((c) => c.pageRef))).toEqual(new Set(["p.1", "p.2"]))
  })
})
