import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockUpdate = vi.fn()
const mockEq = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    from: () => ({ update: mockUpdate }),
  })),
}))

import { userAdminUpdateSchema, updateUserAdmin, USER_ROLES } from "./users"

const ctx = { user: { id: "self-1", email: "admin@nodwin.com", role: "admin" }, source: "web" as const }

describe("userAdminUpdateSchema", () => {
  it("accepts a valid partial update", () => {
    const parsed = userAdminUpdateSchema.parse({ role: "sales_manager", active: false })
    expect(parsed.role).toBe("sales_manager")
  })

  it("rejects an unknown role", () => {
    expect(() => userAdminUpdateSchema.parse({ role: "wizard" })).toThrow()
  })

  it("allows nulling entity / manager", () => {
    const parsed = userAdminUpdateSchema.parse({ primaryEntityId: null, managerUserId: null })
    expect(parsed.primaryEntityId).toBeNull()
  })

  it("exposes all nine roles", () => {
    expect(USER_ROLES).toHaveLength(9)
  })
})

describe("updateUserAdmin self-lockout guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockEq.mockResolvedValue({ error: null })
  })

  it("blocks removing your own admin role", async () => {
    await expect(updateUserAdmin(ctx, "self-1", { role: "sales_rep" })).rejects.toThrow(
      /your own admin role/i,
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("blocks deactivating yourself", async () => {
    await expect(updateUserAdmin(ctx, "self-1", { active: false })).rejects.toThrow(
      /deactivate your own/i,
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("allows keeping your own admin role", async () => {
    await updateUserAdmin(ctx, "self-1", { role: "admin", fullName: "Me" })
    expect(mockUpdate).toHaveBeenCalled()
  })

  it("allows editing another user's role", async () => {
    await updateUserAdmin(ctx, "other-2", { role: "sales_rep", active: false })
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ primary_role: "sales_rep", active: false }))
  })
})
