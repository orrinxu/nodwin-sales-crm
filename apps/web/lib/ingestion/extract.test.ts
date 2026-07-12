import { describe, it, expect, vi } from "vitest"

// Parsers are mocked — we test the MIME routing + segment shaping in extract.ts,
// not unpdf/mammoth themselves.
vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: "Hello from DOCX", messages: [] })),
  },
}))
vi.mock("unpdf", () => ({
  extractText: vi.fn(async () => ({ text: ["Page one", "Page two"] })),
  getDocumentProxy: vi.fn(async () => ({})),
}))

import {
  extractText,
  isNativelyExtractable,
  UnsupportedMimeError,
  DOCX_MIME,
} from "./extract"

const bytes = new Uint8Array([1, 2, 3])

describe("extractText", () => {
  it("extracts DOCX text via mammoth (one segment)", async () => {
    expect(await extractText({ bytes, mimeType: DOCX_MIME })).toEqual([
      { text: "Hello from DOCX" },
    ])
  })

  it("extracts PDF text page-by-page via unpdf", async () => {
    expect(await extractText({ bytes, mimeType: "application/pdf" })).toEqual([
      { ref: "p.1", text: "Page one" },
      { ref: "p.2", text: "Page two" },
    ])
  })

  it("decodes text/* natively", async () => {
    const body = new TextEncoder().encode("plain text body")
    expect(await extractText({ bytes: body, mimeType: "text/plain" })).toEqual([
      { text: "plain text body" },
    ])
  })

  it("throws UnsupportedMimeError for an unhandled binary (e.g. PPTX)", async () => {
    await expect(
      extractText({
        bytes,
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    ).rejects.toBeInstanceOf(UnsupportedMimeError)
  })
})

describe("isNativelyExtractable", () => {
  it("PDF and DOCX go through parsers (not 'native'); text/* is native", () => {
    expect(isNativelyExtractable("text/plain")).toBe(true)
    expect(isNativelyExtractable("application/json")).toBe(true)
    expect(isNativelyExtractable("application/pdf")).toBe(false)
    expect(isNativelyExtractable(DOCX_MIME)).toBe(false)
  })
})
