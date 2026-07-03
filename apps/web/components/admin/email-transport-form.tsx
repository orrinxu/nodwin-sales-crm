"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EmailTransportConfig } from "@/lib/data/email-transport"

interface EmailTransportFormProps {
  config: EmailTransportConfig | null
  currentUserEmail: string
  saveAction: (input: unknown) => Promise<void>
  testAction: (toEmail: string) => Promise<void>
}

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function EmailTransportForm({
  config,
  currentUserEmail,
  saveAction,
  testAction,
}: EmailTransportFormProps) {
  const router = useRouter()
  const [provider, setProvider] = useState<"smtp" | "resend">(config?.provider ?? "resend")
  const [fromName, setFromName] = useState(config?.fromName ?? "")
  const [fromAddress, setFromAddress] = useState(config?.fromAddress ?? "")
  const [smtpHost, setSmtpHost] = useState(config?.smtpHost ?? "")
  const [smtpPort, setSmtpPort] = useState(config?.smtpPort ? String(config.smtpPort) : "587")
  const [smtpSecure, setSmtpSecure] = useState(config?.smtpSecure ?? true)
  const [smtpUsername, setSmtpUsername] = useState(config?.smtpUsername ?? "")
  const [smtpPassword, setSmtpPassword] = useState("")
  const [resendApiKey, setResendApiKey] = useState("")
  const [resendDomain, setResendDomain] = useState(config?.resendDomain ?? "")
  const [active, setActive] = useState(config?.active ?? true)

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [testEmail, setTestEmail] = useState(currentUserEmail)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  async function handleSave() {
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      await saveAction({
        provider,
        fromName: fromName || null,
        fromAddress: fromAddress || null,
        smtpHost: smtpHost || null,
        smtpPort: smtpPort ? Number(smtpPort) : null,
        smtpSecure,
        smtpUsername: smtpUsername || null,
        smtpPassword, // blank = keep existing (write-only)
        resendApiKey, // blank = keep existing
        resendDomain: resendDomain || null,
        active,
      })
      setSaved(true)
      setSmtpPassword("")
      setResendApiKey("")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setPending(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      await testAction(testEmail)
      setTestResult(`✅ Test email sent to ${testEmail}. Check the inbox.`)
    } catch (e) {
      setTestResult(`❌ ${e instanceof Error ? e.message : "Test failed"}`)
    } finally {
      setTesting(false)
    }
  }

  const passwordPlaceholder = config?.hasSmtpPassword ? "•••••••• (leave blank to keep)" : "SMTP password"
  const apiKeyPlaceholder = config?.hasResendApiKey ? "•••••••• (leave blank to keep)" : "Resend API key"

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how the CRM sends email. Credentials are stored securely and never shown again.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Transport</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {saved && <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">Saved.</div>}

          <div className="grid gap-1.5">
            <Label htmlFor="provider">Provider</Label>
            <select id="provider" className={SELECT_CLASS} value={provider} onChange={(e) => setProvider(e.target.value as "smtp" | "resend")}>
              <option value="smtp">SMTP (any mail server)</option>
              <option value="resend">Resend</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="from-name">From name</Label>
              <Input id="from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Nodwin CRM" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from-address">From address</Label>
              <Input id="from-address" type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="notifications@nodwin.com" />
            </div>
          </div>

          {provider === "smtp" ? (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 grid gap-1.5">
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input id="smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input id="smtp-port" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value.replace(/[^0-9]/g, ""))} placeholder="587" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="smtp-user">Username</Label>
                <Input id="smtp-user" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} placeholder="apikey / user@example.com" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="smtp-pass">Password</Label>
                <Input id="smtp-pass" type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={passwordPlaceholder} autoComplete="new-password" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
                Use TLS (secure) — on for port 465, off for STARTTLS on 587
              </label>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="grid gap-1.5">
                <Label htmlFor="resend-key">Resend API key</Label>
                <Input id="resend-key" type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder={apiKeyPlaceholder} autoComplete="new-password" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="resend-domain">Sending domain</Label>
                <Input id="resend-domain" value={resendDomain} onChange={(e) => setResendDomain(e.target.value)} placeholder="crm.nodwin.com" />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (send email through this transport)
          </label>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={pending}>
              <Save className="size-4" />
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Send a test email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Save first, then send a test to confirm the transport works.</p>
          <div className="flex items-center gap-2">
            <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
            <Button variant="outline" onClick={handleTest} disabled={testing || !testEmail}>
              <Send className="size-4" />
              {testing ? "Sending..." : "Send test"}
            </Button>
          </div>
          {testResult && <p className="text-sm">{testResult}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
