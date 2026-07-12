"use client"

import { useRef, useState } from "react"
import { Plus, FileText, Sparkles, PencilLine, UploadCloud, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import type { GenerateOpportunityResult } from "@/app/(crm)/opportunities/generate-actions"

// Opportunity Generator — entry flow + review UI (ORR-677, ticket 4/4).
//
// "Create Opportunity" → a small chooser modal (fill it out myself / generate
// from a document). The generate path takes pasted text or a dropped text file,
// shows a brief "analysing" transition, then opens the EXISTING create form
// (unchanged) pre-filled with AI suggestions and an "AI-generated — review"
// banner. Confirming runs the existing createOpportunity path. Nothing is ever
// auto-created.
//
// v1 input is pasted text or a text-based file (.txt/.eml/.md). PDF/DOCX parsing
// rides on the Phase-2 file-storage work; the panel says so.

type FormProps = React.ComponentProps<typeof OpportunityForm>

type Props = Omit<FormProps, "open" | "onOpenChange" | "prefill" | "banner" | "trigger"> & {
  generateAction: (input: { text: string }) => Promise<GenerateOpportunityResult>
}

type Phase = "idle" | "chooser" | "input" | "analysing" | "error"

const ANALYSE_STEPS = ["Reading document", "Extracting fields", "Matching to your records"]

const TEXT_FILE = /\.(txt|eml|md|markdown|csv|log|json|text)$/i

export function OpportunityGenerator({ generateAction, ...formProps }: Props) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [text, setText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [analyseStep, setAnalyseStep] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The existing form, driven controlled. Remounted (key) whenever a fresh
  // prefill arrives so react-hook-form re-seeds its defaults.
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [result, setResult] = useState<GenerateOpportunityResult | null>(null)

  function reset() {
    setText("")
    setFileName(null)
    setErrorMsg(null)
    setAnalyseStep(0)
  }

  function openForm(res: GenerateOpportunityResult | null) {
    setResult(res)
    setFormKey((k) => k + 1)
    setFormOpen(true)
    setPhase("idle")
    reset()
  }

  async function handleFile(file: File) {
    if (!TEXT_FILE.test(file.name) && !file.type.startsWith("text/")) {
      setErrorMsg("For now, drop a text file (.txt, .eml, .md) or paste the text below. PDF/DOCX support is coming.")
      return
    }
    setErrorMsg(null)
    setText(await file.text())
    setFileName(file.name)
  }

  async function onAnalyse() {
    if (!text.trim()) {
      setErrorMsg("Paste or drop a document first.")
      return
    }
    setPhase("analysing")
    setErrorMsg(null)
    setAnalyseStep(0)
    const t1 = setTimeout(() => setAnalyseStep(1), 1200)
    const t2 = setTimeout(() => setAnalyseStep(2), 3200)
    try {
      const res = await generateAction({ text })
      clearTimeout(t1)
      clearTimeout(t2)
      if (!res.ok) {
        setPhase("error")
        setErrorMsg(res.error ?? "The document could not be read. Try pasting a clearer version.")
        return
      }
      openForm(res)
    } catch {
      clearTimeout(t1)
      clearTimeout(t2)
      setPhase("error")
      setErrorMsg("Something went wrong while analysing. Please try again.")
    }
  }

  const chooserOpen = phase === "chooser" || phase === "input" || phase === "analysing" || phase === "error"

  return (
    <>
      <Button onClick={() => { reset(); setPhase("chooser") }}>
        <Plus className="size-4" />
        Create Opportunity
      </Button>

      <Dialog open={chooserOpen} onOpenChange={(o) => { if (!o) { setPhase("idle"); reset() } }}>
        <DialogContent className="sm:max-w-lg">
          {phase === "chooser" && (
            <>
              <DialogHeader>
                <DialogTitle>Create opportunity</DialogTitle>
                <DialogDescription>Start from scratch, or let AI pre-fill it from a document.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => { setPhase("idle"); openForm(null) }}
                  className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent"
                >
                  <PencilLine className="size-5 text-muted-foreground" />
                  <span className="font-medium">Fill it out myself</span>
                  <span className="text-xs text-muted-foreground">Open a blank opportunity form.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("input")}
                  className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent"
                >
                  <Sparkles className="size-5 text-muted-foreground" />
                  <span className="font-medium">Generate from a document</span>
                  <span className="text-xs text-muted-foreground">Drop an RFP or email — AI pre-fills the form.</span>
                </button>
              </div>
            </>
          )}

          {phase === "input" && (
            <>
              <DialogHeader>
                <DialogTitle>Generate from a document</DialogTitle>
                <DialogDescription>Paste the text, or drop a text file. You&apos;ll review everything before it saves.</DialogDescription>
              </DialogHeader>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f) }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm transition ${dragging ? "border-primary bg-accent" : "border-muted-foreground/30"}`}
              >
                <UploadCloud className="size-5 text-muted-foreground" />
                {fileName ? <span className="font-medium">{fileName}</span> : <span>Drop a text file here, or click to choose</span>}
                <span className="text-xs text-muted-foreground">.txt, .eml, .md — PDF/DOCX coming soon</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.eml,.md,.markdown,.csv,.log,.json,text/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
                />
              </div>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setFileName(null) }}
                placeholder="…or paste the RFP / email chain here."
                rows={7}
                className="w-full resize-y rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPhase("chooser")}>Back</Button>
                <Button type="button" onClick={onAnalyse} disabled={!text.trim()}>
                  <Sparkles className="size-4" /> Analyse
                </Button>
              </DialogFooter>
            </>
          )}

          {phase === "analysing" && (
            <>
              <DialogHeader>
                <DialogTitle>Analysing…</DialogTitle>
                <DialogDescription>This usually takes about 10–20 seconds.</DialogDescription>
              </DialogHeader>
              {fileName && (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" /> {fileName}
                </div>
              )}
              <ul className="space-y-2">
                {ANALYSE_STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2 text-sm">
                    {i < analyseStep ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : i === analyseStep ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="size-4 rounded-full border" />
                    )}
                    <span className={i <= analyseStep ? "" : "text-muted-foreground"}>{label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase === "error" && (
            <>
              <DialogHeader>
                <DialogTitle>Couldn&apos;t read that</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setPhase("idle"); openForm(null) }}>Fill it out myself</Button>
                <Button type="button" onClick={() => setPhase("input")}>Try again</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <OpportunityForm
        key={formKey}
        {...formProps}
        open={formOpen}
        onOpenChange={setFormOpen}
        prefill={result?.prefill}
        banner={result ? <ReviewBanner result={result} /> : undefined}
      />
    </>
  )
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name", account: "Account", primaryContact: "Primary contact", salesUnit: "Sales unit",
  amount: "Amount", currency: "Currency", closeDate: "Close date", servicePeriodStart: "Service start",
  servicePeriodEnd: "Service end", executionDate: "Execution date", countryExecution: "Country",
  serviceType: "Service type", propertyType: "Property type", projectType: "Project type",
  revenueCategory: "Revenue category", recurring: "Recurring", recurringSplitKind: "Recurring split",
  barterValue: "Barter value", estimatedGrossMarginPct: "Gross margin", description: "Description",
}

function ReviewBanner({ result }: { result: GenerateOpportunityResult }) {
  const entries = Object.entries(result.resolution ?? {})
  const needsReview = entries.filter(([, r]) => r.status !== "ok" && r.status !== "matched")
  return (
    <div className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-primary" />
        AI-generated from your document — review each field before saving.
      </div>
      {result.truncated && (
        <p className="text-xs text-muted-foreground">The document was long and was trimmed before analysing.</p>
      )}
      {entries.length > 0 && (
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {entries.map(([key, r]) => {
            const review = r.status !== "ok" && r.status !== "matched"
            // eslint-disable-next-line security/detect-object-injection -- key comes from the resolver's fixed field set
            const label = FIELD_LABELS[key] ?? key
            return (
              <li key={key} className="flex items-start gap-1.5">
                {review ? (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-primary" />
                )}
                <span>
                  <span className="text-muted-foreground">{label}:</span>{" "}
                  <span className="font-medium">{r.display ?? "—"}</span>
                  {review && (
                    <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">needs review</Badge>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {needsReview.length === 0 && entries.length > 0 && (
        <p className="text-xs text-muted-foreground">Everything matched — double-check and save.</p>
      )}
      {(result.notes ?? []).length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {result.notes!.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  )
}
