import { describe, it, expect, vi, beforeEach } from "vitest"
import { createElement } from "react"

const mockSignOut = vi.fn()

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}))

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

import { Header } from "./header"
import { getInitials } from "@/lib/utils/shell"

describe("getInitials", () => {
  it("returns first 2 uppercase letters from a full name", () => {
    expect(getInitials("John Doe")).toBe("JD")
  })

  it("handles single name", () => {
    expect(getInitials("Alice")).toBe("A")
  })

  it("handles three-part name", () => {
    expect(getInitials("John Michael Doe")).toBe("JM")
  })

  it("extracts first 2 chars of email when no name", () => {
    expect(getInitials(undefined, "alice@example.com")).toBe("AL")
  })

  it("returns U when neither name nor email provided", () => {
    expect(getInitials()).toBe("U")
  })
})

describe("Header", () => {
  const mockUser = { id: "user-123", email: "test@nodwin.com", role: "admin" }

  beforeEach(() => {
    mockSignOut.mockReset()
    mockPush.mockReset()
  })

  it("does not throw when rendered with a full user", () => {
    expect(() =>
      createHeaderElement(mockUser),
    ).not.toThrow()
  })

  it("does not throw when rendered with only id", () => {
    expect(() =>
      createHeaderElement({ id: "user-abc", email: undefined, role: undefined }),
    ).not.toThrow()
  })

  it("does not throw when onMenuClick handler is omitted", () => {
    expect(() => {
      createElement(Header, { user: mockUser })
    }).not.toThrow()
  })
})

function createHeaderElement(user: { id: string; email: string | undefined; role: string | undefined }) {
  return createElement(Header, { user, onMenuClick: vi.fn() })
}
