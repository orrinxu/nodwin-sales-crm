"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { LoginButton } from "@/components/auth/login-button"
import { MagicLinkForm } from "@/components/auth/magic-link-form"
import { EmailOtpForm } from "@/components/auth/email-otp-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")
  const router = useRouter()

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENV === "local-preview") {
      router.replace("/contacts")
    }
  }, [router])

  if (process.env.NEXT_PUBLIC_ENV === "local-preview") {
    return null
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
            <span className="text-xl font-bold text-primary-foreground">N</span>
          </div>
        </div>
        <CardTitle>Nodwin CRM</CardTitle>
        <CardDescription>
          Sign in with your company account to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error === "disallowed_domain" && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" />
              Access denied
            </div>
            <p className="mt-1 text-destructive/80">
              This email domain is not allowed. Please use your company email
              address (@nodwin.com, @trinitygaming.in, or @maxlevel.gg).
            </p>
          </div>
        )}
        {error && error !== "disallowed_domain" && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error === "auth_failed" && "Authentication failed. Please try again."}
            {error === "missing_code" && "Invalid authentication request."}
            {error !== "auth_failed" && error !== "missing_code" && error !== "disallowed_domain" && (
              <>An error occurred. Please try again.</>
            )}
          </div>
        )}
        {process.env.NEXT_PUBLIC_ENV !== "local-preview" && (
          <>
            <LoginButton />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>
          </>
        )}
        <MagicLinkForm />
        <EmailOtpForm />
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex size-12 animate-pulse items-center justify-center rounded-lg bg-muted" />
            </div>
            <div className="h-5 w-32 animate-pulse rounded bg-muted mx-auto" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted mx-auto mt-2" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="h-9 w-full animate-pulse rounded bg-muted" />
            <div className="h-9 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}
