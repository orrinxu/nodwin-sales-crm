"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Mail, CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
})

type EmailFormData = z.infer<typeof emailSchema>

export function MagicLinkForm() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  })

  async function handleSendMagicLink(data: EmailFormData) {
    setLoading(true)
    setError(null)

    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        shouldCreateUser: true,
      },
    })

    if (sendError) {
      setError(sendError.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="grid gap-4">
        <div className="rounded-lg bg-success-bg p-3 text-sm text-success-fg">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="size-4" />
            Magic link sent
          </div>
          <p className="mt-1">
            Check your email for a sign-in link. You can close this page.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSent(false)
            form.reset()
          }}
          className="text-xs"
        >
          Send to a different email
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={form.handleSubmit(handleSendMagicLink)} className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="magic-link-email">Email address</Label>
          <Input
            id="magic-link-email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Mail className="mr-2 size-4" />
          )}
          Send magic link
        </Button>
      </form>
    </div>
  )
}
