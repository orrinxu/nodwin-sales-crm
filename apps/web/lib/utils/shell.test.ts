import { describe, it, expect } from "vitest"
import { getInitials } from "./shell"

describe("getInitials", () => {
  it("returns first 2 uppercase letters from a full name", () => {
    expect(getInitials("John Doe")).toBe("JD")
  })

  it("handles single name", () => {
    expect(getInitials("Alice")).toBe("A")
  })

  it("handles three-part name by taking first 2 words", () => {
    expect(getInitials("John Michael Doe")).toBe("JM")
  })

  it("extracts first 2 chars of email when no name", () => {
    expect(getInitials(undefined, "alice@example.com")).toBe("AL")
  })

  it("lowercases email prefix for initials", () => {
    expect(getInitials(undefined, "ab@test.com")).toBe("AB")
  })

  it("returns U when neither name nor email provided", () => {
    expect(getInitials()).toBe("U")
  })

  it("returns U when both undefined", () => {
    expect(getInitials(undefined, undefined)).toBe("U")
  })

  it("truncates long name to 2 chars", () => {
    expect(getInitials("Alexander Benjamin Christopher")).toBe("AB")
  })
})
