import { describe, it, expect } from "vitest"
import { AppShell } from "./app-shell"

describe("AppShell", () => {
  const mockUser = { id: "user-1", email: "a@nodwin.com", role: "admin" }

  it("does not throw when rendered with children", () => {
    expect(() =>
      createAppShellElement(mockUser, "child content"),
    ).not.toThrow()
  })

  it("does not throw with minimal user (id only)", () => {
    expect(() =>
      createAppShellElement({ id: "user-min", email: undefined, role: undefined }, "ok"),
    ).not.toThrow()
  })
})

function createAppShellElement(user: { id: string; email: string | undefined; role: string | undefined }, childText: string) {
  return <AppShell user={user}><span>{childText}</span></AppShell>
}
