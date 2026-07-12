"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Loader2, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SaveBar } from "@/components/primitives/save-bar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTheme } from "@/components/theme/theme-provider"
import { useSignOut } from "@/lib/auth/session-manager"
import { createClient } from "@/lib/supabase/client"
import type {
  UserPreferencesRecord,
  CurrencyOption,
} from "@/lib/data/user-preferences"
import type { OwnProfileRecord } from "@/lib/data/user-profile"
import type {
  UserNotificationOverrideRecord,
  NotificationEventType,
  NotificationChannel,
} from "@/lib/data/notifications"
import { FacetTabs, FacetTabsList, FacetTabsTab, FacetTabsPanel } from "@/components/primitives/facet-tabs"
import { ApiTokensPanel } from "@/components/settings/api-tokens-view"
import { EntityCombobox } from "@/components/entity-combobox"
import type { ApiTokenRecord } from "@/lib/data/api-tokens"

// IANA timezone list for the localization combobox. Guarded for runtimes without
// Intl.supportedValuesOf (falls back to an empty list rather than throwing).
const TIMEZONE_OPTIONS = (
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
).map((tz) => ({ id: tz, name: tz }))

const DISPLAY_DEFAULT = "__org_default__"
const ENTRY_MATCH = "__match_display__"

const NOTIFICATION_EVENTS: { value: NotificationEventType; label: string }[] = [
  { value: "stage_change", label: "Deal stage changes" },
  { value: "deal_assigned", label: "Deal assigned to me" },
  { value: "approval_requested", label: "Approval requested" },
  { value: "mention", label: "Mentions" },
  { value: "deal_won", label: "Deal won" },
  { value: "deal_lost", label: "Deal lost" },
]

interface SettingsViewProps {
  preferences: UserPreferencesRecord
  profile: OwnProfileRecord
  currencies: CurrencyOption[]
  notificationOverrides: UserNotificationOverrideRecord[]
  updateProfileAction: (input: { fullName: string; jobTitle: string | null }) => Promise<void>
  updateLocalizationAction: (input: unknown) => Promise<void>
  updateAppearanceAction: (input: { theme: "light" | "dark" | "system" }) => Promise<void>
  updateNotificationOverrideAction: (input: {
    eventType: NotificationEventType
    channel: NotificationChannel
    enabled: boolean
  }) => Promise<void>
  tokens: ApiTokenRecord[]
  createTokenAction: (input: unknown) => Promise<{ token: string; record: ApiTokenRecord }>
  revokeTokenAction: (id: string) => Promise<void>
}

function SavedIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    )
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        <Check className="size-3" /> Saved
      </span>
    )
  }
  return null
}

type SaveState = "idle" | "saving" | "saved" | "error"

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileSection({
  profile,
  jobTitle: initialJobTitle,
  updateProfileAction,
}: {
  profile: OwnProfileRecord
  jobTitle: string | null
  updateProfileAction: SettingsViewProps["updateProfileAction"]
}) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile.fullName ?? "")
  const [jobTitle, setJobTitle] = useState(initialJobTitle ?? "")
  // Baseline of the last-saved values; the SaveBar shows while the fields differ.
  const [baseline, setBaseline] = useState({
    fullName: profile.fullName ?? "",
    jobTitle: initialJobTitle ?? "",
  })
  const [state, setState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)

  const dirty = fullName !== baseline.fullName || jobTitle !== baseline.jobTitle

  function discard() {
    setFullName(baseline.fullName)
    setJobTitle(baseline.jobTitle)
    setError(null)
  }

  async function onSave() {
    if (!fullName.trim()) {
      setError("Name is required.")
      return
    }
    setState("saving")
    setError(null)
    try {
      const next = { fullName: fullName.trim(), jobTitle: jobTitle.trim() }
      await updateProfileAction({ fullName: next.fullName, jobTitle: next.jobTitle || null })
      setFullName(next.fullName)
      setJobTitle(next.jobTitle)
      setBaseline(next)
      setState("saved")
      router.refresh()
    } catch (err) {
      setState("error")
      setError(err instanceof Error ? err.message : "Failed to save profile.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>Your name and job title. Role and entity are managed by your admin.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="full-name">Name <span className="text-destructive">*</span></Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="job-title">Job title</Label>
            <Input id="job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Sales Manager" />
          </div>
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{profile.email ?? "—"}</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <div><Badge variant="secondary" className="capitalize">{(profile.role ?? "—").replace(/_/g, " ")}</Badge></div>
          </div>
          <div className="grid gap-1.5">
            <Label>Entity</Label>
            <p className="text-sm text-muted-foreground">{profile.entityName ?? "—"}</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Business unit</Label>
            <p className="text-sm text-muted-foreground">{profile.businessUnitName ?? "—"}</p>
          </div>
          {profile.crmInboundEmail && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>CRM inbound email</Label>
              <p className="font-mono text-xs text-muted-foreground">{profile.crmInboundEmail}</p>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <SaveBar
        open={dirty}
        saving={state === "saving"}
        onSave={onSave}
        onDiscard={discard}
      />
    </Card>
  )
}

// ── Localization ────────────────────────────────────────────────────────────────

function LocalizationSection({
  preferences,
  currencies,
  updateLocalizationAction,
}: {
  preferences: UserPreferencesRecord
  currencies: CurrencyOption[]
  updateLocalizationAction: SettingsViewProps["updateLocalizationAction"]
}) {
  const router = useRouter()
  const [displayCurrency, setDisplayCurrency] = useState(preferences.displayCurrency ?? DISPLAY_DEFAULT)
  const [entryCurrency, setEntryCurrency] = useState(preferences.entryCurrencyDefault ?? ENTRY_MATCH)
  const [timezone, setTimezone] = useState(preferences.timezone ?? "")
  const [numberFormat, setNumberFormat] = useState(preferences.numberFormat)
  const [dateFormat, setDateFormat] = useState(preferences.dateFormat)
  // Baseline of the last-saved values; the SaveBar shows while any field differs.
  const [baseline, setBaseline] = useState({
    displayCurrency: preferences.displayCurrency ?? DISPLAY_DEFAULT,
    entryCurrency: preferences.entryCurrencyDefault ?? ENTRY_MATCH,
    timezone: preferences.timezone ?? "",
    numberFormat: preferences.numberFormat,
    dateFormat: preferences.dateFormat,
  })
  const [state, setState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)

  const dirty =
    displayCurrency !== baseline.displayCurrency ||
    entryCurrency !== baseline.entryCurrency ||
    timezone !== baseline.timezone ||
    numberFormat !== baseline.numberFormat ||
    dateFormat !== baseline.dateFormat

  function discard() {
    setDisplayCurrency(baseline.displayCurrency)
    setEntryCurrency(baseline.entryCurrency)
    setTimezone(baseline.timezone)
    setNumberFormat(baseline.numberFormat)
    setDateFormat(baseline.dateFormat)
    setError(null)
  }

  async function onSave() {
    setState("saving")
    setError(null)
    try {
      await updateLocalizationAction({
        displayCurrency: displayCurrency === DISPLAY_DEFAULT ? null : displayCurrency,
        entryCurrencyDefault: entryCurrency === ENTRY_MATCH ? null : entryCurrency,
        timezone: timezone.trim() || null,
        numberFormat,
        dateFormat,
      })
      setBaseline({ displayCurrency, entryCurrency, timezone, numberFormat, dateFormat })
      setState("saved")
      router.refresh()
    } catch (err) {
      setState("error")
      setError(err instanceof Error ? err.message : "Failed to save localization.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Localization &amp; region</CardTitle>
        <CardDescription>
          Display currency converts pipeline totals in your dashboards and reports. Entry default only pre-fills new deals — it never changes a saved deal&rsquo;s currency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Display currency</Label>
            <Select value={displayCurrency} onValueChange={(v) => setDisplayCurrency(v ?? DISPLAY_DEFAULT)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={DISPLAY_DEFAULT}>Organisation default</SelectItem>
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Default entry currency (new deals)</Label>
            <Select value={entryCurrency} onValueChange={(v) => setEntryCurrency(v ?? ENTRY_MATCH)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ENTRY_MATCH}>Match display currency</SelectItem>
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>Timezone</Label>
            <EntityCombobox
              items={TIMEZONE_OPTIONS}
              value={timezone || null}
              onChange={(v) => setTimezone(v ?? "")}
              placeholder="Select timezone…"
              searchPlaceholder="Search timezones…"
              emptyMessage="No matching timezone."
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Number format</Label>
            <Select value={numberFormat} onValueChange={(v) => setNumberFormat(v as typeof numberFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="international">International (1,234,567)</SelectItem>
                <SelectItem value="indian">Indian (12,34,567)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Date format</Label>
            <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as typeof dateFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="iso">ISO (2026-07-03)</SelectItem>
                <SelectItem value="us">US (Jul 3, 2026)</SelectItem>
                <SelectItem value="international">International (3 Jul 2026)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Number, date, and timezone preferences apply across the app — dates and times render in your selected format and zone.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <SaveBar
        open={dirty}
        saving={state === "saving"}
        onSave={onSave}
        onDiscard={discard}
      />
    </Card>
  )
}

// ── Notifications ───────────────────────────────────────────────────────────────

function NotificationsSection({
  overrides,
  updateNotificationOverrideAction,
}: {
  overrides: UserNotificationOverrideRecord[]
  updateNotificationOverrideAction: SettingsViewProps["updateNotificationOverrideAction"]
}) {
  // No override row => fall back to org routing; default the toggle to ON.
  const initial = new Map<string, boolean>()
  for (const o of overrides) initial.set(`${o.eventType}:${o.channel}`, o.enabled)

  const [enabledMap, setEnabledMap] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  function isOn(event: NotificationEventType, channel: NotificationChannel) {
    return enabledMap.get(`${event}:${channel}`) ?? true
  }

  async function toggle(event: NotificationEventType, channel: NotificationChannel, next: boolean) {
    const key = `${event}:${channel}`
    setEnabledMap((m) => new Map(m).set(key, next))
    setError(null)
    try {
      await updateNotificationOverrideAction({ eventType: event, channel, enabled: next })
    } catch (err) {
      // Revert on failure.
      setEnabledMap((m) => new Map(m).set(key, !next))
      setError(err instanceof Error ? err.message : "Failed to update notification setting.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
        <CardDescription>Choose how you&rsquo;re notified per event. Changes save immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 text-left font-medium">Event</th>
                <th className="px-3 py-2 text-center font-medium">Email</th>
                <th className="px-3 py-2 text-center font-medium">In-app</th>
                <th className="px-3 py-2 text-center font-medium">Slack</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_EVENTS.map((ev) => (
                <tr key={ev.value} className="border-b last:border-0">
                  <td className="py-2.5">{ev.label}</td>
                  <td className="px-3 text-center">
                    <Switch
                      checked={isOn(ev.value, "email")}
                      onCheckedChange={(v: boolean) => toggle(ev.value, "email", v)}
                      aria-label={`Email for ${ev.label}`}
                    />
                  </td>
                  <td className="px-3 text-center">
                    <Switch
                      checked={isOn(ev.value, "in_app")}
                      onCheckedChange={(v: boolean) => toggle(ev.value, "in_app", v)}
                      aria-label={`In-app for ${ev.label}`}
                    />
                  </td>
                  <td className="px-3 text-center">
                    <div className="inline-flex flex-col items-center gap-0.5">
                      <Switch checked={false} disabled aria-label={`Slack for ${ev.label} (coming soon)`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Slack delivery is coming soon. Digest frequency and quiet hours aren&rsquo;t available yet.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

// ── Appearance ──────────────────────────────────────────────────────────────────

function AppearanceSection({
  preferences,
  updateAppearanceAction,
}: {
  preferences: UserPreferencesRecord
  updateAppearanceAction: SettingsViewProps["updateAppearanceAction"]
}) {
  const { setTheme } = useTheme()
  const [theme, setLocalTheme] = useState(preferences.theme)
  const [state, setState] = useState<SaveState>("idle")

  async function onChange(next: "light" | "dark" | "system") {
    setLocalTheme(next)
    setTheme(next) // immediate visual effect
    setState("saving")
    try {
      await updateAppearanceAction({ theme: next })
      setState("saved")
    } catch {
      setState("error")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Theme applies immediately and is saved to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid max-w-xs gap-1.5">
          <Label>Theme</Label>
          <Select value={theme} onValueChange={(v) => onChange(v as "light" | "dark" | "system")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <SavedIndicator state={state} />
      </CardContent>
    </Card>
  )
}

// ── Integrations (read-only informational) ──────────────────────────────────────

function IntegrationsSection({ onOpenTokens }: { onOpenTokens: () => void }) {
  // Copy reflects what actually ships today (audited 2026-07-12): Drive import is
  // a live per-user feature; Gmail/Calendar are not connected; Slack delivery is
  // not available yet; personal access tokens live on the Access tokens tab.
  const rows = [
    {
      name: "Google Workspace",
      detail: "Import files from Google Drive on any record — you grant access per file. Gmail and Calendar aren’t connected yet.",
      status: "Drive only",
    },
    {
      name: "Slack",
      detail: "Slack notification delivery isn’t available yet.",
      status: "Coming soon",
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integrations</CardTitle>
        <CardDescription>How this CRM connects to the tools you already use.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div>
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.detail}</p>
            </div>
            <Badge variant="outline" className="shrink-0">{r.status}</Badge>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
          <div>
            <p className="text-sm font-medium">Personal access tokens</p>
            <p className="text-xs text-muted-foreground">
              Generate and manage tokens for external agents on the{" "}
              <button
                type="button"
                onClick={onOpenTokens}
                className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Access tokens
              </button>{" "}
              tab.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">Available</Badge>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Security ────────────────────────────────────────────────────────────────────

function SecuritySection() {
  const router = useRouter()
  const { signOut } = useSignOut()
  const [pending, setPending] = useState<"one" | "all" | null>(null)

  async function signOutEverywhere() {
    setPending("all")
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "global" })
    router.push("/login")
  }

  async function signOutHere() {
    setPending("one")
    await signOut()
    router.push("/login")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Security &amp; access</CardTitle>
        <CardDescription>You can sign in with Google, an email &amp; password, a magic link, or a one-time email code. Listing individual active sessions isn&rsquo;t available.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={signOutHere} disabled={pending !== null}>
          <LogOut className="size-4" /> Sign out
        </Button>
        <Button variant="outline" size="sm" onClick={signOutEverywhere} disabled={pending !== null}>
          {pending === "all" ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          Sign out everywhere
        </Button>
      </CardContent>
    </Card>
  )
}

export function SettingsView({
  preferences,
  profile,
  currencies,
  notificationOverrides,
  updateProfileAction,
  updateLocalizationAction,
  updateAppearanceAction,
  updateNotificationOverrideAction,
  tokens,
  createTokenAction,
  revokeTokenAction,
}: SettingsViewProps) {
  const [tab, setTab] = useState("profile")

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your personal preferences.</p>
      </div>

      <FacetTabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <FacetTabsList>
          <FacetTabsTab value="profile">Profile</FacetTabsTab>
          <FacetTabsTab value="localization">Localization</FacetTabsTab>
          <FacetTabsTab value="notifications">Notifications</FacetTabsTab>
          <FacetTabsTab value="appearance">Appearance</FacetTabsTab>
          <FacetTabsTab value="tokens">Access tokens</FacetTabsTab>
          <FacetTabsTab value="integrations">Integrations</FacetTabsTab>
          <FacetTabsTab value="security">Security</FacetTabsTab>
        </FacetTabsList>

        <FacetTabsPanel value="profile" className="max-w-3xl pt-2">
          <ProfileSection
            profile={profile}
            jobTitle={preferences.jobTitle}
            updateProfileAction={updateProfileAction}
          />
        </FacetTabsPanel>

        <FacetTabsPanel value="localization" className="max-w-3xl pt-2">
          <LocalizationSection
            preferences={preferences}
            currencies={currencies}
            updateLocalizationAction={updateLocalizationAction}
          />
        </FacetTabsPanel>

        <FacetTabsPanel value="notifications" className="max-w-3xl pt-2">
          <NotificationsSection
            overrides={notificationOverrides}
            updateNotificationOverrideAction={updateNotificationOverrideAction}
          />
        </FacetTabsPanel>

        <FacetTabsPanel value="appearance" className="max-w-3xl pt-2">
          <AppearanceSection
            preferences={preferences}
            updateAppearanceAction={updateAppearanceAction}
          />
        </FacetTabsPanel>

        <FacetTabsPanel value="tokens" className="max-w-3xl pt-2">
          <ApiTokensPanel tokens={tokens} createAction={createTokenAction} revokeAction={revokeTokenAction} />
        </FacetTabsPanel>

        <FacetTabsPanel value="integrations" className="max-w-3xl pt-2">
          <IntegrationsSection onOpenTokens={() => setTab("tokens")} />
        </FacetTabsPanel>

        <FacetTabsPanel value="security" className="max-w-3xl pt-2">
          <SecuritySection />
        </FacetTabsPanel>
      </FacetTabs>
    </div>
  )
}
