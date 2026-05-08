"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Mail, ArrowLeft, KeyRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
})

const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
})

type EmailFormData = z.infer<typeof emailSchema>
type OtpFormData = z.infer<typeof otpSchema>

export function EmailOtpForm() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<"email" | "otp">("email")
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  })

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  })

  async function handleSendOtp(data: EmailFormData) {
    setLoading(true)
    setError(null)

    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        shouldCreateUser: true,
      },
    })

    if (sendError) {
      setError(sendError.message)
      setLoading(false)
      return
    }

    setEmail(data.email)
    setLoading(false)
    setStep("otp")
  }

  async function handleVerifyOtp(data: OtpFormData) {
    setLoading(true)
    setError(null)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: data.otp,
      type: "email",
    })

    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
      return
    }

    router.refresh()
    router.push("/contacts")
  }

  function handleBack() {
    setStep("email")
    setError(null)
    otpForm.reset()
  }

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === "email" ? (
        <form onSubmit={emailForm.handleSubmit(handleSendOtp)} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
              {...emailForm.register("email")}
            />
            {emailForm.formState.errors.email && (
              <p className="text-xs text-destructive">
                {emailForm.formState.errors.email.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={loading || !emailForm.watch("email")}>
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Mail className="mr-2 size-4" />
            )}
            Send verification code
          </Button>
        </form>
      ) : (
        <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="otp">Verification code</Label>
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit code sent to {email}
            </p>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              placeholder="000000"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              {...otpForm.register("otp", {
                onChange: (e) => {
                  const sanitized = e.target.value.replace(/\D/g, "").slice(0, 6)
                  e.target.value = sanitized
                },
              })}
            />
            {otpForm.formState.errors.otp && (
              <p className="text-xs text-destructive">
                {otpForm.formState.errors.otp.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={loading || otpForm.watch("otp").length !== 6}>
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 size-4" />
            )}
            Verify code
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={loading}
            className="text-xs"
          >
            <ArrowLeft className="mr-1 size-3" />
            Use a different email
          </Button>
        </form>
      )}
    </div>
  )
}
