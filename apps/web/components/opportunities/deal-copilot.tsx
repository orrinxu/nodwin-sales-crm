"use client"

import { useState, useCallback } from "react"
import { Sparkles, FileText, Mail, ListChecks, Copy, Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CopilotAction, DealCopilotResult } from "@/lib/ai/deal-copilot"

type CopilotFn = (opportunityId: string) => Promise<DealCopilotResult>

interface DealCopilotProps {
  opportunityId: string
  /** Whether an AI provider is configured (admin settings or env). */
  configured: boolean
  summaryAction: CopilotFn
  emailAction: CopilotFn
  nextBestActionAction: CopilotFn
}

const CARD_HEADING = "text-[13.5px] font-semibold tracking-[-0.01em]"

/**
 * AI Deal Copilot card for the opportunity detail right rail. Three grounded
 * actions: summarize, draft follow-up email (editable + copy), next best action.
 * When no provider is configured, renders a disabled hint instead of throwing.
 */
export function DealCopilot({
  opportunityId,
  configured,
  summaryAction,
  emailAction,
  nextBestActionAction,
}: DealCopilotProps) {
  const [loading, setLoading] = useState<CopilotAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Read-only result panel for summary / next-best-action.
  const [output, setOutput] = useState<{ kind: CopilotAction; text: string } | null>(null)
  // The email draft is editable, so it lives in its own state.
  const [emailDraft, setEmailDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const run = useCallback(
    async (action: CopilotAction, fn: CopilotFn) => {
      if (loading) return
      setLoading(action)
      setError(null)
      try {
        const res = await fn(opportunityId)
        if (!res.ok || !res.text) {
          setError(res.error ?? "Something went wrong. Please try again.")
          return
        }
        if (action === "email") {
          setEmailDraft(res.text)
          setCopied(false)
        } else {
          setOutput({ kind: action, text: res.text })
        }
      } catch {
        setError("The Copilot request failed. Please try again.")
      } finally {
        setLoading(null)
      }
    },
    [opportunityId, loading],
  )

  const copyEmail = useCallback(async () => {
    if (!emailDraft) return
    try {
      await navigator.clipboard.writeText(emailDraft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError("Couldn't copy to clipboard.")
    }
  }, [emailDraft])

  const disabled = !configured || loading !== null

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className={cn(CARD_HEADING, "flex items-center gap-1.5")}>
          <Sparkles className="size-4 text-muted-foreground" />
          Deal Copilot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <p className="max-w-[240px] text-xs text-muted-foreground">
              Configure an AI provider under Admin → AI to use the Deal Copilot.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              AI assists grounded in this deal&apos;s fields and recent activity.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={disabled}
                onClick={() => run("summary", summaryAction)}
              >
                {loading === "summary" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                Summarize deal
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={disabled}
                onClick={() => run("email", emailAction)}
              >
                {loading === "email" ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                Draft follow-up email
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={disabled}
                onClick={() => run("next_best_action", nextBestActionAction)}
              >
                {loading === "next_best_action" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ListChecks className="size-3.5" />
                )}
                Next best action
              </Button>
            </div>

            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            {output && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  {output.kind === "summary" ? "Summary" : "Next best actions"}
                </p>
                <p className="whitespace-pre-wrap text-[13px] leading-[1.55] text-foreground/90">{output.text}</p>
              </div>
            )}

            {emailDraft !== null && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                    Follow-up email draft
                  </p>
                  <Button variant="ghost" size="xs" onClick={copyEmail}>
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <textarea
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  aria-label="Follow-up email draft"
                  rows={10}
                  className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] leading-[1.55] outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
                <p className="text-[11px] text-muted-foreground">
                  Review and edit before sending — AI drafts can contain mistakes.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
