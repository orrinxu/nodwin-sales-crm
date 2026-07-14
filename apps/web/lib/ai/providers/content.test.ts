import { describe, it, expect } from "vitest"
import { openAiUserContent, anthropicUserContent, geminiParts, ollamaImages } from "./content"

const IMG = { mimeType: "image/png", dataBase64: "aGVsbG8=" }

describe("openAiUserContent", () => {
  it("returns the bare string when there are no images (byte-identical to before)", () => {
    expect(openAiUserContent("hi")).toBe("hi")
    expect(openAiUserContent("hi", [])).toBe("hi")
  })
  it("returns text + image_url blocks with a data URL when images are present", () => {
    expect(openAiUserContent("read this", [IMG])).toEqual([
      { type: "text", text: "read this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
    ])
  })
})

describe("anthropicUserContent", () => {
  it("returns the bare string when there are no images", () => {
    expect(anthropicUserContent("hi")).toBe("hi")
  })
  it("returns base64 image source blocks followed by the text block", () => {
    expect(anthropicUserContent("read this", [IMG])).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } },
      { type: "text", text: "read this" },
    ])
  })
})

describe("geminiParts", () => {
  it("returns a single text part when there are no images", () => {
    expect(geminiParts("hi")).toEqual([{ text: "hi" }])
  })
  it("appends an inlineData part per image", () => {
    expect(geminiParts("read this", [IMG])).toEqual([
      { text: "read this" },
      { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } },
    ])
  })
})

describe("ollamaImages", () => {
  it("returns undefined when there are no images (so the body omits the key)", () => {
    expect(ollamaImages()).toBeUndefined()
    expect(ollamaImages([])).toBeUndefined()
  })
  it("returns bare base64 strings (no mime, no data prefix)", () => {
    expect(ollamaImages([IMG])).toEqual(["aGVsbG8="])
  })
})
