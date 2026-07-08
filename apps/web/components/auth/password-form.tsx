"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, LogIn } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

// Mirrors the allow-list enforced server-side in app/auth/confirm/route.ts.
// Password sign-in does not pass through /auth/confirm, so we re-check here to
// avoid opening a bypass around the domain restriction.
const ALLOWED_DOMAINS = ["nodwin.com", "trinitygaming.in", "maxlevel.gg"]

function isAllowedDomain(email: string | undefined | null): boolean {
  if (!email) return false
  const atIndex = email.lastIndexOf("@")
  if (atIndex <= 0 || atIndex >= email.length - 1) return false
  if (email.indexOf("@") !== atIndex) return false
  return ALLOWED_DOMAINS.includes(email.slice(atIndex + 1).toLowerCase())
}

const passwordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Please enter your password"),
})

type PasswordFormData = z.infer<typeof passwordSchema>

export function PasswordForm() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: "", password: "" },
  })

  async function handleSignIn(data: PasswordFormData) {
    setLoading(true)
    setError(null)

    if (!isAllowedDomain(data.email)) {
      setError(
        "This email domain is not allowed. Please use your company email address (@nodwin.com, @trinitygaming.in, or @maxlevel.gg).",
      )
      setLoading(false)
      return
    }

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    // Defense in depth: enforce the domain allow-list post-authentication,
    // matching app/auth/confirm/route.ts.
    if (!isAllowedDomain(signInData.user?.email)) {
      await supabase.auth.signOut()
      setError(
        "This email domain is not allowed. Please use your company email address (@nodwin.com, @trinitygaming.in, or @maxlevel.gg).",
      )
      setLoading(false)
      return
    }

    // Refresh server components so they pick up the new session, then navigate.
    router.refresh()
    router.push("/dashboard")
  }

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={form.handleSubmit(handleSignIn)} className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="password-email">Email address</Label>
          <Input
            id="password-email"
            type="email"
            placeholder="you@nodwin.com"
            autoComplete="email"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password-password">Password</Label>
          <Input
            id="password-password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">
              {form.formState.errors.password.message}
            </p>
          )}
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <LogIn className="mr-2 size-4" />
          )}
          Sign in
        </Button>
      </form>
    </div>
  )
}
