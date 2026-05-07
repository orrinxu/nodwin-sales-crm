"use client"

import { useSearchParams } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { LoginButton } from "@/components/auth/login-button"

export function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  return (
    <>
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
      <LoginButton />
    </>
  )
}
