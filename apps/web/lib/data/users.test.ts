import { describe, it, expect, vi, beforeEach } from "vitest"
import { profileUpdateSchema } from "./users"

const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()

const mockQueryBuilder = {
  select: mockSelect,
  update: mockUpdate,
  eq: mockEq,
  single: mockSingle,
}

mockSelect.mockReturnValue(mockQueryBuilder)
mockUpdate.mockReturnValue(mockQueryBuilder)
mockEq.mockReturnValue(mockQueryBuilder)

const mockFrom = vi.fn().mockReturnValue(mockQueryBuilder)

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("server-only", () => ({}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web",
}

const mockDbRecord = {
  id: "user-1",
  email: "alice@nodwin.com",
  full_name: "Alice",
  primary_role: "admin",
  primary_entity_id: "entity-1",
  manager_user_id: "user-2",
  crm_inbound_email: "abc123@crm.nodwin.com",
  custom_data: { notification_preferences: { emailNotifications: true, weeklyDigest: false } },
  created_at: "2026-01-01T00:00:00Z",
  entities: { name: "Acme Corp" },
  manager: { full_name: "Bob Manager" },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getProfile", () => {
  it("returns profile with joined entity and manager names", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { getProfile } = await import("./users")
    const result = await getProfile(defaultCtx)

    expect(result.id).toBe("user-1")
    expect(result.email).toBe("alice@nodwin.com")
    expect(result.fullName).toBe("Alice")
    expect(result.primaryRole).toBe("admin")
    expect(result.primaryEntityName).toBe("Acme Corp")
    expect(result.managerName).toBe("Bob Manager")
    expect(result.crmInboundEmail).toBe("abc123@crm.nodwin.com")
    expect(result.createdAt).toBe("2026-01-01T00:00:00Z")
  })

  it("throws when Supabase returns an error", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: new Error("DB error") })

    const { getProfile } = await import("./users")
    await expect(getProfile(defaultCtx)).rejects.toThrow("Failed to load profile")
  })

  it("throws when data is null without error", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null })

    const { getProfile } = await import("./users")
    await expect(getProfile(defaultCtx)).rejects.toThrow("Failed to load profile")
  })
})

describe("updateProfile", () => {
  it("updates fullName only and returns refreshed profile", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { getProfile, updateProfile } = await import("./users")

    const result = await updateProfile(defaultCtx, { fullName: "Alice Updated" })

    expect(mockUpdate).toHaveBeenCalledWith({ full_name: "Alice Updated" })
    expect(result.id).toBe("user-1")
    expect(result.fullName).toBe("Alice")
  })

  it("updates notification preferences in custom_data", async () => {
    mockSingle
      .mockResolvedValueOnce({
        data: { custom_data: { existing_pref: true } },
        error: null,
      })
      .mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { updateProfile } = await import("./users")

    await updateProfile(defaultCtx, {
      notificationPreferences: { emailNotifications: false, weeklyDigest: true },
    })

    expect(mockSelect).toHaveBeenCalledWith("custom_data")

    const callArgs = mockUpdate.mock.calls[0][0]
    expect(callArgs.custom_data).toEqual({
      existing_pref: true,
      notification_preferences: { emailNotifications: false, weeklyDigest: true },
    })
  })

  it("does nothing when called with empty input", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { updateProfile } = await import("./users")
    const result = await updateProfile(defaultCtx, {})

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result.id).toBe("user-1")
  })
})

describe("profileUpdateSchema", () => {
  it("accepts valid fullName", () => {
    const result = profileUpdateSchema.safeParse({ fullName: "Alice" })
    expect(result.success).toBe(true)
  })

  it("accepts null fullName", () => {
    const result = profileUpdateSchema.safeParse({ fullName: null })
    expect(result.success).toBe(true)
  })

  it("rejects fullName over 100 chars", () => {
    const result = profileUpdateSchema.safeParse({ fullName: "a".repeat(101) })
    expect(result.success).toBe(false)
  })

  it("accepts valid notification preferences", () => {
    const result = profileUpdateSchema.safeParse({
      notificationPreferences: { emailNotifications: true, weeklyDigest: false },
    })
    expect(result.success).toBe(true)
  })

  it("accepts empty notification preferences", () => {
    const result = profileUpdateSchema.safeParse({
      notificationPreferences: {},
    })
    expect(result.success).toBe(true)
  })
})
