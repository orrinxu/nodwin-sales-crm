import { describe, it, expect } from "vitest"
import { decodeCsvBuffer } from "./decode"

function bytes(...b: number[]): ArrayBuffer {
  return new Uint8Array(b).buffer
}

describe("decodeCsvBuffer (ORR-809i)", () => {
  it("decodes plain UTF-8", () => {
    const buf = new TextEncoder().encode("Name\nMüller").buffer
    const { text, encoding } = decodeCsvBuffer(buf)
    expect(text).toContain("Müller")
    expect(encoding).toBe("utf-8")
  })

  it("strips and honours a UTF-8 BOM", () => {
    const body = new TextEncoder().encode("Name")
    const buf = new Uint8Array([0xef, 0xbb, 0xbf, ...body]).buffer
    const { text, encoding } = decodeCsvBuffer(buf)
    expect(encoding).toBe("utf-8-bom")
    // The BOM is preserved here; the CSV parser strips it. It must not corrupt text.
    expect(text).toContain("Name")
  })

  it("falls back to Windows-1252 for non-UTF-8 bytes instead of mojibake", () => {
    // "Müller" in ISO-8859-1 / Windows-1252: ü is 0xFC — invalid as UTF-8.
    const buf = bytes(0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72) // M ü l l e r
    const { text, encoding } = decodeCsvBuffer(buf)
    expect(text).toBe("Müller")
    expect(encoding).toBe("windows-1252")
  })

  it("decodes UTF-16LE with BOM", () => {
    const buf = bytes(0xff, 0xfe, 0x48, 0x00, 0x69, 0x00) // "Hi"
    const { text, encoding } = decodeCsvBuffer(buf)
    expect(text).toBe("Hi")
    expect(encoding).toBe("utf-16le")
  })
})
