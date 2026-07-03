import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const state: { existing: unknown; updateArg: unknown; insertArg: unknown } = {
  existing: null,
  updateArg: null,
  insertArg: null,
}

function makeSelf() {
  const self: Record<string, unknown> = {}
  self.then = (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: state.existing, error: null })
  self.select = () => self
  self.order = () => self
  self.limit = () => self
  self.maybeSingle = () => self
  self.eq = () => self
  self.update = (arg: unknown) => {
    state.updateArg = arg
    return self
  }
  self.insert = (arg: unknown) => {
    state.insertArg = arg
    return self
  }
  return self
}

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => ({ from: () => makeSelf() })) }))
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn(() => ({ from: () => makeSelf() })) }))
vi.mock("@/lib/security/env", () => ({ env: {} }))

const ctx = { user: { id: "u", email: "a@b.com", role: "admin" }, source: "web" as const }

describe("email transport data layer", () => {
  beforeEach(() => {
    state.existing = null
    state.updateArg = null
    state.insertArg = null
    vi.clearAllMocks()
  })

  it("getEmailTransport strips the secrets from the returned config", async () => {
    state.existing = {
      provider: "smtp",
      smtp_host: "smtp.example.com",
      smtp_password: "SECRET",
      resend_api_key: "KEY",
      smtp_secure: true,
      active: true,
    }
    const { getEmailTransport } = await import("../email-transport")
    const cfg = (await getEmailTransport(ctx)) as unknown as Record<string, unknown>

    expect(cfg.smtpHost).toBe("smtp.example.com")
    expect(cfg.hasSmtpPassword).toBe(true)
    expect(cfg.hasResendApiKey).toBe(true)
    expect("smtpPassword" in cfg).toBe(false)
    expect("resendApiKey" in cfg).toBe(false)
  })

  it("upsert keeps the existing secrets when the fields are blank (write-only)", async () => {
    state.existing = { id: "row-1" }
    const { upsertEmailTransport } = await import("../email-transport")
    await upsertEmailTransport(ctx, { provider: "smtp", smtpHost: "h", smtpPassword: "", resendApiKey: "" })

    const patch = state.updateArg as Record<string, unknown>
    expect(patch.smtp_host).toBe("h")
    expect("smtp_password" in patch).toBe(false)
    expect("resend_api_key" in patch).toBe(false)
  })

  it("upsert writes the secret when a value is provided", async () => {
    state.existing = { id: "row-1" }
    const { upsertEmailTransport } = await import("../email-transport")
    await upsertEmailTransport(ctx, { provider: "smtp", smtpHost: "h", smtpPassword: "newpass" })

    expect((state.updateArg as Record<string, unknown>).smtp_password).toBe("newpass")
  })
})
