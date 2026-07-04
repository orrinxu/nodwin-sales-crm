import "server-only"
import type { DriveClient } from "./types"

export type { DriveClient, DriveFile } from "./types"

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
