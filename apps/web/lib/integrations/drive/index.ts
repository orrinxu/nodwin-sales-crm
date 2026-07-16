import "server-only"
import type { DriveClient, DriveAdminClient, DriveFolder } from "./types"
import { env } from "@/lib/security/env"
import { getDriveAccessToken, isDriveConfigured } from "./service-account-auth"

export type { DriveClient, DriveFile, DriveAdminClient, DriveFolder } from "./types"
export { isDriveConfigured } from "./service-account-auth"

const DRIVE_API = "https://www.googleapis.com/drive/v3"
const FOLDER_MIME = "application/vnd.google-apps.folder"

/**
 * ORR-620 seam. Returns a DriveClient that throws until the real Google Drive
 * implementation (service-account auth + googleapis) is wired in. The port is
 * open; nothing is plugged in yet. Replace the body of `fetchFile` with a
 * googleapis `drive.files.get({ alt: 'media' })` / `files.export` call and read
 * credentials via `lib/security/env.ts`.
 */
export function createDriveClient(): DriveClient {
  return {
    async fetchFile(): Promise<never> {
      throw new Error(
        "Google Drive client is not configured — ORR-620 left the byte-fetch seam " +
          "unwired. Provide a service-account googleapis implementation of DriveClient.fetchFile.",
      )
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORR-698: service-account Drive admin client (folder create + permission sync)
// ─────────────────────────────────────────────────────────────────────────────

/** Shared params so calls work against both My Drive and a shared drive. */
function sharedDriveParams(): Record<string, string> {
  const params: Record<string, string> = { supportsAllDrives: "true" }
  const driveId = env.GOOGLE_DRIVE_SHARED_DRIVE_ID
  if (driveId) {
    params.driveId = driveId
    params.corpora = "drive"
    params.includeItemsFromAllDrives = "true"
  }
  return params
}

async function driveFetch(
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {},
): Promise<Response> {
  const token = await getDriveAccessToken()
  const url = new URL(`${DRIVE_API}${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Drive API ${init.method ?? "GET"} ${path} failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  return res
}

/** Escape a value for use inside a Drive `q` string literal. */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

interface PermissionEntry {
  id: string
  emailAddress?: string
  role: string
  type: string
}

/**
 * The service-account Drive admin client for folder + permission sync. Returns
 * `null` when Drive isn't configured, so callers stay a no-op until an operator
 * provides GOOGLE_SERVICE_ACCOUNT_KEY.
 */
export function createDriveAdminClient(): DriveAdminClient | null {
  if (!isDriveConfigured()) return null

  return {
    async ensureFolder({ name, parentId }): Promise<DriveFolder> {
      const q =
        `name = '${escapeQuery(name)}' and '${escapeQuery(parentId)}' in parents ` +
        `and mimeType = '${FOLDER_MIME}' and trashed = false`
      const listRes = await driveFetch("/files", {
        query: { ...sharedDriveParams(), q, fields: "files(id,name,webViewLink)" },
      })
      const list = (await listRes.json()) as { files?: DriveFolder[] }
      if (list.files && list.files.length > 0) return list.files[0]

      const createRes = await driveFetch("/files", {
        method: "POST",
        query: { ...sharedDriveParams(), fields: "id,name,webViewLink" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
      })
      return (await createRes.json()) as DriveFolder
    },

    async syncPermissions(fileId, emails): Promise<void> {
      const desired = new Set(emails.map((e) => e.toLowerCase()).filter(Boolean))

      const listRes = await driveFetch(`/files/${encodeURIComponent(fileId)}/permissions`, {
        query: { ...sharedDriveParams(), fields: "permissions(id,emailAddress,role,type)" },
      })
      const existing = ((await listRes.json()) as { permissions?: PermissionEntry[] }).permissions ?? []

      const existingUserEmails = new Set<string>()
      for (const perm of existing) {
        if (perm.type !== "user" || !perm.emailAddress) continue
        const email = perm.emailAddress.toLowerCase()
        existingUserEmails.add(email)
        // Revoke user grants no longer in the desired set — but never the owner.
        if (!desired.has(email) && perm.role !== "owner") {
          await driveFetch(`/files/${encodeURIComponent(fileId)}/permissions/${perm.id}`, {
            method: "DELETE",
            query: sharedDriveParams(),
          })
        }
      }

      for (const email of desired) {
        if (existingUserEmails.has(email)) continue
        await driveFetch(`/files/${encodeURIComponent(fileId)}/permissions`, {
          method: "POST",
          query: { ...sharedDriveParams(), sendNotificationEmail: "false" },
          body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
        })
      }
    },
  }
}
