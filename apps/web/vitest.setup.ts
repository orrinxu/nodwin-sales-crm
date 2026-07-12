/// <reference types="vitest/globals" />
import "@testing-library/jest-dom"
import "@testing-library/jest-dom/vitest"

vi.mock("server-only", () => ({}))

// Component tests render client components bare, outside the (crm) layout that
// mounts <PreferencesProvider>, so usePreferences() would throw. Provide a
// default preferences context: "us" date-format + ambient timezone reproduces
// the pre-preference en-US, ambient-zone formatting these components had before
// the timezone retrofit, so existing rendered-date assertions stay valid.
vi.mock("@/components/providers/preferences-provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/providers/preferences-provider")>()
  const { formatPreferenceDate, formatPreferenceDateTime } = await import("@/lib/format")
  return {
    ...actual,
    usePreferences: () => ({
      dateFormat: "us" as const,
      timezone: null,
      formatDate: (v: string | Date | null | undefined, fallback = "") =>
        formatPreferenceDate(v, "us", fallback, null),
      formatDateTime: (v: string | Date | null | undefined, fallback = "") =>
        formatPreferenceDateTime(v, "us", fallback, null),
    }),
  }
})
