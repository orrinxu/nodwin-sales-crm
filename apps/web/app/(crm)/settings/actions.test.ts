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
vi.mock("@/lib/integrations/calendar/sync", () => ({
  runCalendarSyncForUser: vi.fn(),
}))

// A minimal chainable Supabase stub: `.from(...).upsert(...)` resolves to the
// configured result. Captures the upsert call for assertions.
const upsertMock = vi.fn(async () => ({ error: null as { message: string } | null }))
const fromMock = vi.fn(() => ({ upsert: upsertMock }))
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}))

import {
  disconnectGoogleAction,
  setCalendarSyncEnabledAction,
  syncCalendarNowAction,
} from "./actions"
import { requireUser } from "@/lib/security/auth"
import { disconnectGoogle } from "@/lib/integrations/google/token-store"
import { runCalendarSyncForUser } from "@/lib/integrations/calendar/sync"
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

describe("setCalendarSyncEnabledAction (ORR-827)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertMock.mockResolvedValue({ error: null })
  })

  it("upserts the caller's own sync-state row and revalidates /settings", async () => {
    await setCalendarSyncEnabledAction(true)

    expect(requireUser).toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith("google_calendar_sync_state")
    // user_id is forced to the authenticated caller; onConflict is user_id.
    expect(upsertMock).toHaveBeenCalledWith(
      { user_id: "user-1", sync_enabled: true },
      { onConflict: "user_id" },
    )
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("passes through a disabled toggle", async () => {
    await setCalendarSyncEnabledAction(false)
    expect(upsertMock).toHaveBeenCalledWith(
      { user_id: "user-1", sync_enabled: false },
      { onConflict: "user_id" },
    )
  })

  it("throws (and skips revalidate) when the upsert fails", async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: "rls denied" } })
    await expect(setCalendarSyncEnabledAction(true)).rejects.toThrow("rls denied")
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("syncCalendarNowAction (ORR-827)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("runs the sync for the caller and returns counts on success", async () => {
    vi.mocked(runCalendarSyncForUser).mockResolvedValueOnce({
      upserted: 3,
      removed: 1,
    })

    const result = await syncCalendarNowAction()

    expect(runCalendarSyncForUser).toHaveBeenCalledWith("user-1")
    expect(result).toEqual({ ok: true, upserted: 3, removed: 1 })
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("surfaces a skipped run (sync off / not connected) as ok+skipped", async () => {
    vi.mocked(runCalendarSyncForUser).mockResolvedValueOnce({
      skipped: true,
      upserted: 0,
      removed: 0,
    })

    const result = await syncCalendarNowAction()
    expect(result).toEqual({ ok: true, skipped: true })
  })

  it("catches an engine error and returns a structured failure (never throws)", async () => {
    vi.mocked(runCalendarSyncForUser).mockRejectedValueOnce(
      new Error("token expired"),
    )

    const result = await syncCalendarNowAction()
    expect(result).toEqual({ ok: false, error: "token expired" })
    // No revalidate on the failure path.
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
