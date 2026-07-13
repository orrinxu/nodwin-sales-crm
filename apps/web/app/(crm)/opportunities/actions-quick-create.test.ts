import { describe, it, expect, vi, beforeEach } from "vitest"

const USER_ID = "00000000-0000-0000-0000-000000000001"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/security/auth", () => ({
  requireUser: vi.fn(async () => ({ id: USER_ID, email: "a@x.com", role: "sales_rep" })),
  requireRole: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Keep the REAL accountCreateSchema (so validation is exercised for real);
// mock only the DB write.
vi.mock("@/lib/data/accounts", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/data/accounts")>()
  return {
    ...actual,
    createAccount: vi.fn(async () => ({ id: "acc-1", name: "GRYPHLINE" })),
  }
})

import { createAccountQuickAction } from "./actions"
import { createAccount } from "@/lib/data/accounts"

const mockCreate = vi.mocked(createAccount)

beforeEach(() => mockCreate.mockClear())

describe("createAccountQuickAction", () => {
  it("creates via the existing createAccount path with owner = current user and returns {id,name}", async () => {
    const res = await createAccountQuickAction({ name: "GRYPHLINE" })

    // Reuses the existing data path with the {user, source} ctx (RLS + created_by
    // trigger + audit); owner defaulted to the caller.
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const [ctx, input] = mockCreate.mock.calls[0]
    expect(ctx).toEqual(expect.objectContaining({ user: expect.objectContaining({ id: USER_ID }), source: "web" }))
    expect(input).toEqual(expect.objectContaining({ name: "GRYPHLINE", accountOwnerUserId: USER_ID }))

    // Returns the EntityOption shape EntityCombobox.onCreate expects.
    expect(res).toEqual({ id: "acc-1", name: "GRYPHLINE" })
  })
})
