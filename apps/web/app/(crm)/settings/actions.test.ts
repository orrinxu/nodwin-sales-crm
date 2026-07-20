import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/security/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", email: "u@n.com", role: "sales" })),
}))
// The other data modules are pulled in by the actions barrel; stub them so the
// module loads without touching real server clients.
vi.mock("@/lib/data/user-preferences", () => ({
  upsertUserPreferences: vi.fn(),
  userPreferencesUpdateSchema: { parse: vi.fn((v) => v) },
}))
vi.mock("@/lib/data/user-profile", () => ({
  updateOwnProfile: vi.fn(),
  ownProfileUpdateSchema: { parse: vi.fn((v) => v) },
}))
vi.mock("@/lib/data/notifications", () => ({
  upsertUserNotificationOverride: vi.fn(),
}))
vi.mock("@/lib/integrations/google/token-store", () => ({
  disconnectGoogle: vi.fn(),
}))

import { disconnectGoogleAction } from "./actions"
import { requireUser } from "@/lib/security/auth"
import { disconnectGoogle } from "@/lib/integrations/google/token-store"
import { revalidatePath } from "next/cache"

describe("disconnectGoogleAction (ORR-821)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("disconnects the caller's own Google connection and revalidates /settings", async () => {
    await disconnectGoogleAction()

    // userId is forced to the authenticated caller — never client-supplied.
    expect(disconnectGoogle).toHaveBeenCalledWith("user-1")
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("propagates a disconnect failure (does not silently swallow it)", async () => {
    vi.mocked(disconnectGoogle).mockRejectedValueOnce(new Error("revoke failed"))
    await expect(disconnectGoogleAction()).rejects.toThrow("revoke failed")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("resolves the caller via requireUser", async () => {
    await disconnectGoogleAction()
    expect(requireUser).toHaveBeenCalled()
  })
})
