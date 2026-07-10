"use client"

import { useCallback, useRef, useState } from "react"
import Script from "next/script"
import { FolderInput, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  uploadBlobToDocuments,
  finalizeUpload,
  type UploadTarget,
} from "@/lib/documents/client-upload"

// drive.file is the least-privilege scope: it only grants access to files the
// user explicitly opens through the Picker — not their whole Drive.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

// Baked into the client bundle at build time (Dockerfile ARGs). When either is
// missing the button hides itself — the rest of the Files module still works.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY

interface DriveImportButtonProps {
  target: UploadTarget
  /** Mark a filename as in-flight (reuses the Files module's progress list). */
  onFileStart: (name: string) => void
  onFileDone: (name: string) => void
  onError: (message: string) => void
  /** Called once after a batch of imports completes, to refresh the list. */
  onComplete: () => void
}

function ensurePdfExtension(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`
}

/** Download the bytes for one picked Drive file. Native Google-format files
 *  (Docs/Sheets/Slides) can't be downloaded raw, so export them to PDF. */
async function fetchDriveFile(
  doc: GooglePickerDoc,
  token: string,
): Promise<{ blob: Blob; name: string; mimeType: string }> {
  const isNativeGoogleDoc = doc.mimeType.startsWith("application/vnd.google-apps")
  const endpoint = isNativeGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=application%2Fpdf`
    : `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`
  const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) {
    throw new Error(`Google Drive download failed (${resp.status})`)
  }
  const blob = await resp.blob()
  return {
    blob,
    name: isNativeGoogleDoc ? ensurePdfExtension(doc.name) : doc.name,
    mimeType: isNativeGoogleDoc ? "application/pdf" : doc.mimeType || blob.type,
  }
}

/**
 * "Import from Drive" button. Opens the Google Picker (per-user OAuth,
 * drive.file scope), then copies each picked file's bytes into Supabase Storage
 * via the same signed-URL path as a direct upload — so imported files are stored
 * on the VPS (and RAG-indexable), with the Drive id kept only as provenance.
 */
export function DriveImportButton({
  target,
  onFileStart,
  onFileDone,
  onError,
  onComplete,
}: DriveImportButtonProps) {
  const [gisReady, setGisReady] = useState(false)
  const [pickerReady, setPickerReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const configured = Boolean(CLIENT_ID && API_KEY)

  const importPickedFiles = useCallback(
    async (docs: GooglePickerDoc[], token: string) => {
      let anySucceeded = false
      for (const doc of docs) {
        onFileStart(doc.name)
        try {
          const { blob, name, mimeType } = await fetchDriveFile(doc, token)
          await uploadBlobToDocuments(target, blob, {
            name,
            mimeType,
            driveFileId: doc.id,
            driveFolderId: doc.parentId,
            linkUrl: doc.url ?? `https://drive.google.com/file/d/${doc.id}/view`,
          })
          anySucceeded = true
        } catch (e) {
          onError(`Couldn't import ${doc.name}: ${(e as Error).message}`)
        } finally {
          onFileDone(doc.name)
        }
      }
      if (anySucceeded) {
        try {
          await finalizeUpload(target)
        } catch {
          // Non-fatal: the bytes are saved; the list just won't auto-refresh.
        }
        onComplete()
      }
    },
    [target, onFileStart, onFileDone, onError, onComplete],
  )

  const openPicker = useCallback(
    (token: string) => {
      const picker = window.google!.picker
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
      new picker.PickerBuilder()
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY!)
        .setTitle("Select files to import")
        .addView(view)
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED && data.docs?.length) {
            setBusy(true)
            busyRef.current = true
            void importPickedFiles(data.docs, token).finally(() => {
              setBusy(false)
              busyRef.current = false
            })
          }
        })
        .build()
        .setVisible(true)
    },
    [importPickedFiles],
  )

  const handleClick = useCallback(() => {
    if (busyRef.current || !gisReady || !pickerReady) return
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          onError(`Google sign-in failed: ${response.error ?? "no access token"}`)
          return
        }
        openPicker(response.access_token)
      },
      error_callback: (err) => {
        // Fires when the user closes the consent popup — stay quiet on cancel.
        if (err.type !== "popup_closed") {
          onError(`Google sign-in failed: ${err.message ?? err.type ?? "unknown"}`)
        }
      },
    })
    tokenClient.requestAccessToken({ prompt: "" })
  }, [gisReady, pickerReady, openPicker, onError])

  if (!configured) return null

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="lazyOnload"
        onReady={() => setGisReady(true)}
      />
      <Script
        src="https://apis.google.com/js/api.js"
        strategy="lazyOnload"
        onReady={() => window.gapi?.load("picker", () => setPickerReady(true))}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={busy || !gisReady || !pickerReady}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderInput className="size-4" />}
        Import from Drive
      </Button>
    </>
  )
}
