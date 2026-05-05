import { describe, it, expect, vi, beforeEach } from "vitest"

const mockInsert = vi.fn()
const mockFrom = vi.fn()

const mockSupabaseClient = {
  from: mockFrom,
}

vi.mock("server-only", () => ({}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => mockSupabaseClient),
}))
vi.mock("./env", () => ({
  env: {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "eyjanon.abcdef123",
    SUPABASE_SERVICE_ROLE_KEY: "eyjrole.abcdef456",
    GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
    APP_URL: "https://app.example.com",
    NEXT_PUBLIC_APP_NAME: "Nodwin CRM",
    NEXT_PUBLIC_API_URL: "https://api.example.com",
    NEXT_PUBLIC_DEBUG: "false" as const,
    NEXT_PUBLIC_LOG_LEVEL: "info" as const,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue({ insert: mockInsert })
  mockInsert.mockResolvedValue({ error: null })
})

describe("audit", () => {
  it("inserts an audit_log row with correct fields for INSERT action", async () => {
    const { audit } = await import("./audit")

    await audit({
      action: "INSERT",
      table: "opportunities",
      row_id: "row-uuid-1",
      actor: { id: "user-uuid-1", email: "user@nodwin.com" },
      after: { name: "Big Deal", amount: 50000 },
    })

    expect(mockFrom).toHaveBeenCalledWith("audit_log")
    expect(mockInsert).toHaveBeenCalledWith({
      operation: "INSERT",
      table_name: "opportunities",
      row_id: "row-uuid-1",
      actor_user_id: "user-uuid-1",
      actor_source: "user",
      actor_ip: null,
      actor_user_agent: null,
      old_data: null,
      new_data: { name: "Big Deal", amount: 50000 },
    })
  })

  it("inserts with old_data snapshot for UPDATE action", async () => {
    const { audit } = await import("./audit")

    await audit({
      action: "UPDATE",
      table: "accounts",
      row_id: "row-uuid-2",
      actor: { id: "user-uuid-2", email: "mgr@nodwin.com" },
      before: { name: "Old Corp", status: "active" },
      after: { name: "New Corp", status: "active" },
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "UPDATE",
        old_data: { name: "Old Corp", status: "active" },
        new_data: { name: "New Corp", status: "active" },
        actor_source: "user",
      }),
    )
  })

  it("inserts with old_data snapshot and null new_data for DELETE action", async () => {
    const { audit } = await import("./audit")

    await audit({
      action: "DELETE",
      table: "contacts",
      row_id: "row-uuid-3",
      actor: { id: "user-uuid-3" },
      before: { name: "Gone Person" },
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "DELETE",
        old_data: { name: "Gone Person" },
        new_data: null,
        actor_source: "user",
      }),
    )
  })

  it("extracts actor_ip from x-forwarded-for request header", async () => {
    const { audit } = await import("./audit")

    const mockRequest = {
      headers: {
        get: (key: string) =>
          ({ "x-forwarded-for": "203.0.113.42", "user-agent": "Mozilla/5.0 Test" })[key] ?? null,
      },
    }

    await audit({
      action: "INSERT",
      table: "opportunities",
      row_id: "row-uuid-4",
      actor: { id: "user-uuid-4" },
      request: mockRequest as any,
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_ip: "203.0.113.42",
        actor_user_agent: "Mozilla/5.0 Test",
      }),
    )
  })

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const { audit } = await import("./audit")

    const mockRequest = {
      headers: {
        get: (key: string) => ({ "x-real-ip": "10.0.0.5" })[key] ?? null,
      },
    }

    await audit({
      action: "DELETE",
      table: "contacts",
      row_id: "row-uuid-5",
      actor: { id: "user-uuid-5" },
      request: mockRequest as any,
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_ip: "10.0.0.5" }),
    )
  })

  it("uses service-role client, not anon client", async () => {
    const { audit } = await import("./audit")
    const { createServerClient } = await import("@supabase/ssr")

    await audit({ action: "INSERT", table: "foo", row_id: "1", actor: { id: "user-1" } })

    expect(createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "eyjrole.abcdef456",
      expect.anything(),
    )
  })

  it("throws on database error", async () => {
    const { audit } = await import("./audit")
    mockInsert.mockResolvedValue({ error: { message: "connection refused" } })

    await expect(
      audit({ action: "INSERT", table: "foo", row_id: "1", actor: { id: "user-1" } }),
    ).rejects.toThrow("audit: connection refused")
  })

  it("accepts no actor and sets actor_source to system", async () => {
    const { audit } = await import("./audit")

    await audit({ action: "INSERT", table: "foo", row_id: "1" })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: null,
        actor_source: "system",
        actor_ip: null,
        actor_user_agent: null,
      }),
    )
  })
})
