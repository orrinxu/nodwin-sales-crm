// Minimal ambient types for the Google Identity Services (GIS) token client and
// the Google Picker API, both loaded at runtime from Google's CDN via
// <Script> (no npm package). Only the surface used by the Drive import button is
// declared — enough to stay type-safe without pulling in @types/gapi.*.

interface GoogleTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void
}

interface GoogleTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
  error_callback?: (error: { type?: string; message?: string }) => void
}

/** A file entry in the Picker's PICKED response. */
interface GooglePickerDoc {
  id: string
  name: string
  mimeType: string
  sizeBytes?: number
  url?: string
  parentId?: string
}

interface GooglePickerResponse {
  action: string
  docs?: GooglePickerDoc[]
}

interface GooglePickerDocsView {
  setIncludeFolders(include: boolean): GooglePickerDocsView
  setSelectFolderEnabled(enabled: boolean): GooglePickerDocsView
  setMimeTypes(mimeTypes: string): GooglePickerDocsView
}

interface GooglePicker {
  setVisible(visible: boolean): void
}

interface GooglePickerBuilder {
  addView(view: GooglePickerDocsView): GooglePickerBuilder
  enableFeature(feature: string): GooglePickerBuilder
  setOAuthToken(token: string): GooglePickerBuilder
  setDeveloperKey(key: string): GooglePickerBuilder
  setAppId(appId: string): GooglePickerBuilder
  setCallback(callback: (data: GooglePickerResponse) => void): GooglePickerBuilder
  setTitle(title: string): GooglePickerBuilder
  build(): GooglePicker
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient
      }
    }
    picker: {
      PickerBuilder: new () => GooglePickerBuilder
      DocsView: new (viewId?: unknown) => GooglePickerDocsView
      ViewId: { DOCS: unknown }
      Feature: { MULTISELECT_ENABLED: string }
      Action: { PICKED: string; CANCEL: string }
    }
  }
  gapi?: {
    load(apiName: string, callback: () => void): void
  }
}
