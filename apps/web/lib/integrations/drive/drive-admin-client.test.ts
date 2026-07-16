import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Pretend Drive is configured and hand back a static token.
vi.mock("./service-account-auth", () => ({
  isDriveConfigured: () => true,
  getDriveAccessToken: async () => "test-token",
}))
vi.mock("@/lib/security/env", () => ({ env: {} }))

import { createDriveAdminClient } from "./index"
import { isDriveConfigured } from "./service-account-auth"

interface Call {
  method: string
  url: string
  body?: string
}

function mockFetch(handler: (call: Call) => { status?: number; json?: unknown }) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = input.toString()
    const call: Call = { method: init?.method ?? "GET", url, body: init?.body as string }
    const { status = 200, json = {} } = handler(call)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      text: async () => JSON.stringify(json),
    } as Response
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createDriveAdminClient (ORR-698)", () => {
  it("returns null when Drive is not configured", async () => {
    const mod = await import("./service-account-auth")
    vi.spyOn(mod, "isDriveConfigured").mockReturnValueOnce(false)
    expect(createDriveAdminClient()).toBeNull()
  })

  it("is available when configured", () => {
    expect(isDriveConfigured()).toBe(true)
    expect(createDriveAdminClient()).not.toBeNull()
  })

  describe("ensureFolder", () => {
    it("returns an existing folder without creating a new one", async () => {
      const fetchMock = mockFetch((call) => {
        if (call.method === "GET") return { json: { files: [{ id: "existing", name: "Deal" }] } }
        throw new Error(`unexpected ${call.method} ${call.url}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createDriveAdminClient()!
      const folder = await client.ensureFolder({ name: "Deal", parentId: "parent1" })

      expect(folder.id).toBe("existing")
      // Only the list call — no POST create.
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("creates a folder when none exists", async () => {
      const fetchMock = mockFetch((call) => {
        if (call.method === "GET") return { json: { files: [] } }
        if (call.method === "POST") return { json: { id: "created", name: "Deal" } }
        throw new Error(`unexpected ${call.method}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createDriveAdminClient()!
      const folder = await client.ensureFolder({ name: "Deal", parentId: "parent1" })

      expect(folder.id).toBe("created")
      const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")
      expect(post).toBeTruthy()
      expect(String((post![1] as RequestInit).body)).toContain("application/vnd.google-apps.folder")
    })
  })

  describe("syncPermissions", () => {
    it("grants missing emails and revokes extra user grants, never the owner", async () => {
      const deleted: string[] = []
      const granted: string[] = []
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString()
        const method = init?.method ?? "GET"
        if (method === "GET") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              permissions: [
                { id: "owner1", type: "user", emailAddress: "owner@x.com", role: "owner" },
                { id: "stale1", type: "user", emailAddress: "old@x.com", role: "reader" },
                { id: "keep1", type: "user", emailAddress: "keep@x.com", role: "reader" },
              ],
            }),
            text: async () => "",
          } as Response
        }
        if (method === "DELETE") {
          deleted.push(url.split("/permissions/")[1].split("?")[0])
          return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response
        }
        // POST create
        granted.push(JSON.parse(init!.body as string).emailAddress)
        return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as Response
      })
      vi.stubGlobal("fetch", fetchMock)

      const client = createDriveAdminClient()!
      await client.syncPermissions("folder1", ["keep@x.com", "new@x.com"])

      expect(granted).toEqual(["new@x.com"]) // keep@x.com already present
      expect(deleted).toEqual(["stale1"]) // old@x.com removed
      // owner@x.com must never be revoked
      expect(deleted).not.toContain("owner1")
    })
  })
})
