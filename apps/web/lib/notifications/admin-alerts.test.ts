import { describe, it, expect, vi, beforeEach } from "vitest"
import { sendAdminAlert } from "./admin-alerts"

const mockFrom = vi.fn()

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("../security/env", () => ({
  env: {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}))

describe("sendAdminAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("inserts an admin alert and returns its id", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "admin_alerts") {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: "alert-123" }, error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const id = await sendAdminAlert({
      title: "Test alert",
      message: "Something happened",
      type: "warning",
      metadata: { foo: "bar" },
    })

    expect(id).toBe("alert-123")
    expect(mockFrom).toHaveBeenCalledWith("admin_alerts")
  })

  it("inserts with default created_by when not provided", async () => {
    let captured: Record<string, unknown> | null = null
    mockFrom.mockImplementation((table: string) => {
      if (table === "admin_alerts") {
        return {
          insert: (obj: Record<string, unknown>) => {
            captured = obj
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "alert-456" }, error: null }),
              }),
            }
          },
        }
      }
      return {}
    })

    await sendAdminAlert({
      title: "No created_by",
      message: "Should use default UUID",
      type: "info",
    })

    expect(captured?.created_by).toBe("00000000-0000-0000-0000-000000000000")
  })

  it("inserts with provided created_by", async () => {
    let captured: Record<string, unknown> | null = null
    mockFrom.mockImplementation((table: string) => {
      if (table === "admin_alerts") {
        return {
          insert: (obj: Record<string, unknown>) => {
            captured = obj
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "alert-789" }, error: null }),
              }),
            }
          },
        }
      }
      return {}
    })

    await sendAdminAlert(
      {
        title: "With user",
        message: "Created by specific user",
        type: "error",
      },
      "user-abc-123",
    )

    expect(captured?.created_by).toBe("user-abc-123")
  })

  it("throws when the database insert fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "admin_alerts") {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: new Error("DB error") }),
            }),
          }),
        }
      }
      return {}
    })

    await expect(
      sendAdminAlert({
        title: "Failing",
        message: "Should throw",
        type: "deadletter",
      }),
    ).rejects.toThrow("DB error")
  })

  it("defaults metadata to empty object when not provided", async () => {
    let captured: Record<string, unknown> | null = null
    mockFrom.mockImplementation((table: string) => {
      if (table === "admin_alerts") {
        return {
          insert: (obj: Record<string, unknown>) => {
            captured = obj
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "alert-default" }, error: null }),
              }),
            }
          },
        }
      }
      return {}
    })

    await sendAdminAlert({
      title: "No metadata",
      message: "Should default to empty",
      type: "info",
    })

    expect(captured?.metadata).toEqual({})
  })
})
