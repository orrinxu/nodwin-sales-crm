import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { SandboxBanner } from "./sandbox-banner"

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_ENV

describe("SandboxBanner", () => {
  beforeEach(() => {
    process.env = { ...process.env, NEXT_PUBLIC_ENV: undefined }
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_ENV = ORIGINAL_ENV
  })

  it("renders null when NEXT_PUBLIC_ENV is not set", () => {
    const result = SandboxBanner()
    expect(result).toBeNull()
  })

  it("renders null when NEXT_PUBLIC_ENV is 'production'", () => {
    process.env.NEXT_PUBLIC_ENV = "production"
    const result = SandboxBanner()
    expect(result).toBeNull()
  })

  it("renders null when NEXT_PUBLIC_ENV is 'local-preview'", () => {
    process.env.NEXT_PUBLIC_ENV = "local-preview"
    const result = SandboxBanner()
    expect(result).toBeNull()
  })

  it("renders banner when NEXT_PUBLIC_ENV is 'sandbox'", () => {
    process.env.NEXT_PUBLIC_ENV = "sandbox"
    const result = SandboxBanner()
    expect(result).not.toBeNull()
  })

  it("displays the sandbox message text when rendered", () => {
    process.env.NEXT_PUBLIC_ENV = "sandbox"
    const result = SandboxBanner()
    const element = result as React.ReactElement
    const span = (element.props as { children: React.ReactNode[] }).children
      .find((child: React.ReactNode) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        (child.props as { children?: string }).children === "Sandbox environment — data is not real and resets periodically."
      )
    expect(span).toBeDefined()
  })
})
