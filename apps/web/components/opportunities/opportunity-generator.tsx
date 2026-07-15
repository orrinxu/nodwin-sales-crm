"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Plus, FileText, Sparkles, PencilLine, UploadCloud, Loader2, CheckCircle2, AlertTriangle, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { VoiceRecorder } from "@/components/generators/voice-recorder"
import { useAutoOpenCreate } from "@/components/generators/use-auto-open-create"
import type { GenerateOpportunityResult, ExtractFileResult, TranscribeAudioResult } from "@/app/(crm)/opportunities/generate-actions"
import { recordExtractionProvenanceAction } from "@/app/(crm)/opportunities/generate-actions"
import { uploadBlobToDocuments, finalizeUpload } from "@/lib/documents/client-upload"
import { persistGeneratorArtifacts } from "@/lib/opportunity/generator-artifacts"

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

type ImagePayload = { mimeType: string; dataBase64: string }

type Props = Omit<FormProps, "open" | "onOpenChange" | "prefill" | "banner" | "trigger"> & {
  generateAction: (input: { text?: string; images?: ImagePayload[] }) => Promise<GenerateOpportunityResult>
  /** Server-side text extraction for binary uploads (PDF/DOCX). When absent, only
   *  pasted text and text files work. */
  extractFileAction?: (formData: FormData) => Promise<ExtractFileResult>
  /** Server-side voice transcription (ORR-745, Track B). When present, the chooser
   *  offers a "record a voice note" path; the transcript feeds the same generate
   *  pipeline as a pasted note. The page passes this only when a transcription
   *  endpoint is configured + enabled. Voice audio is never stored (no RFP). */
  transcribeAction?: (formData: FormData) => Promise<TranscribeAudioResult>
}

type Phase = "idle" | "chooser" | "input" | "record" | "analysing" | "error"

const ANALYSE_STEPS = ["Reading document", "Extracting fields", "Matching to your records"]

const TEXT_FILE = /\.(txt|eml|md|markdown|csv|log|json|text)$/i
const BINARY_FILE = /\.(pdf|docx)$/i
const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

// Best-effort MIME for the retained RFP file when the browser didn't set one.
function rfpMime(file: File): string {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith(".pdf")) return "application/pdf"
  if (name.endsWith(".docx")) return DOCX_MIME
  return "application/octet-stream"
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_FILE.test(file.name)
}

function imageMime(file: File): string {
  if (file.type.startsWith("image/")) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith(".png")) return "image/png"
  if (name.endsWith(".webp")) return "image/webp"
  if (name.endsWith(".gif")) return "image/gif"
  return "image/jpeg"
}

// Base64-encode an image in the browser for the vision path (ORR-686). Chunked so
// String.fromCharCode never gets a multi-MB argument list.
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function OpportunityGenerator({ generateAction, extractFileAction, transcribeAction, ...formProps }: Props) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [text, setText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  // A dropped PDF/DOCX awaiting server-side text extraction on Analyse.
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  // A dropped image (screenshot) analysed directly by a vision model (ORR-686).
  // Not stored as a document (ORR-683 keeps only RFP files).
  const [pendingImage, setPendingImage] = useState<ImagePayload | null>(null)
  // The uploaded RFP file, retained past extraction so it can be attached to the
  // opportunity on confirm (ORR-683). Only set for binary RFP uploads — pasted
  // text / text files never populate it, so they're never stored.
  const [rfpFile, setRfpFile] = useState<File | null>(null)
  // A recorded voice note awaiting transcription. Ephemeral — never stored.
  const [pendingAudio, setPendingAudio] = useState<Blob | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [analyseStep, setAnalyseStep] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The existing form, driven controlled. Remounted (key) whenever a fresh
  // prefill arrives so react-hook-form re-seeds its defaults.
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [result, setResult] = useState<GenerateOpportunityResult | null>(null)

  // Open the chooser once when the global "+ New" launcher routed here with
  // ?create=1 (ORR-746). Fresh-mount state is already initial, so just set phase.
  const autoOpen = useAutoOpenCreate()
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current) {
      autoOpenedRef.current = true
      setPhase("chooser")
    }
  }, [autoOpen])

  function reset() {
    setText("")
    setFileName(null)
    setPendingFile(null)
    setPendingImage(null)
    setPendingAudio(null)
    setErrorMsg(null)
    setAnalyseStep(0)
  }

  function openForm(res: GenerateOpportunityResult | null) {
    setResult(res)
    // The manual ("fill it out myself") path retains no file; only the AI+file
    // path (which sets rfpFile just before calling openForm) does. reset() is not
    // used to clear rfpFile because it runs here on every openForm.
    if (!res) setRfpFile(null)
    setFormKey((k) => k + 1)
    setFormOpen(true)
    setPhase("idle")
    reset()
  }

  // Confirm-path wrapper (ORR-682 + ORR-683): create the opportunity via the
  // real action, then best-effort record provenance + attach the retained RFP
  // file. Failures in the side effects never block the create (the deal already
  // exists), so the form closes cleanly and a retry can't duplicate it.
  const wrappedCreate: FormProps["createAction"] = useCallback(
    async (input) => {
      const created = await formProps.createAction(input)
      await persistGeneratorArtifacts({
        opportunityId: created.id,
        result,
        rfpFile,
        deps: {
          recordProvenance: recordExtractionProvenanceAction,
          uploadRfp: async (opportunityId, file) => {
            await uploadBlobToDocuments({ opportunityId }, file, {
              name: file.name,
              mimeType: rfpMime(file),
              category: "rfp",
            })
            await finalizeUpload({ opportunityId })
          },
        },
      })
      return created
    },
    [formProps.createAction, result, rfpFile],
  )

  const handleFile = useCallback(async (file: File) => {
    const isText = TEXT_FILE.test(file.name) || file.type.startsWith("text/")
    const isBinary =
      BINARY_FILE.test(file.name) || file.type === "application/pdf" || file.type === DOCX_MIME
    const isImage = isImageFile(file)
    if (!isText && !isBinary && !isImage) {
      setErrorMsg("Drop a PDF, DOCX, image, or text file (.txt, .eml, .md), or paste the text below.")
      return
    }
    setErrorMsg(null)
    setFileName(file.name)
    if (isText) {
      // Text files read directly in the browser — no server round-trip.
      setPendingFile(null)
      setPendingImage(null)
      setText(await file.text())
    } else if (isBinary) {
      // PDF/DOCX are extracted server-side when the user hits Analyse.
      setText("")
      setPendingImage(null)
      setPendingFile(file)
    } else {
      // Images (screenshots) go straight to a vision model — no OCR, not stored.
      setText("")
      setPendingFile(null)
      setPendingImage({ mimeType: imageMime(file), dataBase64: await fileToBase64(file) })
    }
  }, [])

  // Whole-viewport drag-and-drop while the document-input step is open, so on a
  // large screen you can drop the file anywhere, not only on the small box.
  useEffect(() => {
    if (phase !== "input") return
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) void handleFile(f)
    }
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("dragleave", onDragLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("dragleave", onDragLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [phase, handleFile])

  async function onAnalyse() {
    if (!text.trim() && !pendingFile && !pendingImage) {
      setErrorMsg("Paste or drop a document first.")
      return
    }
    setPhase("analysing")
    setErrorMsg(null)
    setAnalyseStep(0)
    const t1 = setTimeout(() => setAnalyseStep(1), 1200)
    const t2 = setTimeout(() => setAnalyseStep(2), 3200)
    try {
      // An image goes straight to the vision model; a PDF/DOCX is turned into text
      // server-side first; pasted text / text files are already in `text`.
      let res: GenerateOpportunityResult
      if (pendingImage) {
        res = await generateAction({ images: [pendingImage] })
      } else {
        let docText = text
        if (pendingFile) {
          if (!extractFileAction) throw new Error("no-extractor")
          const fd = new FormData()
          fd.append("file", pendingFile)
          const ex = await extractFileAction(fd)
          if (!ex.ok || !ex.text) {
            clearTimeout(t1)
            clearTimeout(t2)
            setPhase("error")
            setErrorMsg(ex.error ?? "Couldn't read that file. Try another, or paste the text.")
            return
          }
          docText = ex.text
        }
        res = await generateAction({ text: docText })
      }
      clearTimeout(t1)
      clearTimeout(t2)
      if (!res.ok) {
        setPhase("error")
        setErrorMsg(res.error ?? "The document could not be read. Try pasting a clearer version.")
        return
      }
      // Retain the uploaded RFP binary (null for pasted text / text files) so the
      // confirm-path wrapper can attach it to the created opportunity (ORR-683).
      setRfpFile(pendingFile)
      openForm(res)
    } catch {
      clearTimeout(t1)
      clearTimeout(t2)
      setPhase("error")
      setErrorMsg("Something went wrong while analysing. Please try again.")
    }
  }

  // Voice path (ORR-745): transcribe the recording server-side, then feed the
  // transcript into the exact same generate pipeline the paste path uses. A voice
  // note is text-only — no RFP binary is retained (setRfpFile(null)), so nothing
  // is stored on confirm; provenance is still recorded from `result`.
  async function onTranscribeAndAnalyse() {
    if (!pendingAudio || !transcribeAction) return
    setPhase("analysing")
    setErrorMsg(null)
    setAnalyseStep(0)
    const t1 = setTimeout(() => setAnalyseStep(1), 1200)
    const t2 = setTimeout(() => setAnalyseStep(2), 3200)
    try {
      const fd = new FormData()
      fd.append("audio", pendingAudio, "recording.webm")
      const tr = await transcribeAction(fd)
      if (!tr.ok || !tr.text) {
        clearTimeout(t1)
        clearTimeout(t2)
        setPhase("error")
        setErrorMsg(tr.error ?? "Couldn't transcribe that recording. Try again, or type the note instead.")
        return
      }
      const res = await generateAction({ text: tr.text })
      clearTimeout(t1)
      clearTimeout(t2)
      if (!res.ok) {
        setPhase("error")
        setErrorMsg(res.error ?? "The note could not be read. Try again, or type it out.")
        return
      }
      setRfpFile(null)
      openForm(res)
    } catch {
      clearTimeout(t1)
      clearTimeout(t2)
      setPhase("error")
      setErrorMsg("Something went wrong while transcribing. Please try again.")
    }
  }

  const chooserOpen =
    phase === "chooser" || phase === "input" || phase === "record" || phase === "analysing" || phase === "error"

  return (
    <>
      {dragging && phase === "input" && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary bg-background px-8 py-6 text-center shadow-lg">
            <UploadCloud className="mx-auto size-8 text-primary" />
            <p className="mt-2 font-medium">Drop your document to analyse</p>
          </div>
        </div>
      )}
      <Button onClick={() => { reset(); setRfpFile(null); setPhase("chooser") }}>
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
                {transcribeAction && (
                  <button
                    type="button"
                    onClick={() => { reset(); setRfpFile(null); setPhase("record") }}
                    className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent sm:col-span-2"
                  >
                    <Mic className="size-5 text-muted-foreground" />
                    <span className="font-medium">Record a voice note</span>
                    <span className="text-xs text-muted-foreground">Speak it — AI transcribes and pre-fills the form.</span>
                  </button>
                )}
              </div>
            </>
          )}

          {phase === "record" && (
            <>
              <DialogHeader>
                <DialogTitle>Record a voice note</DialogTitle>
                <DialogDescription>Speak naturally about the opportunity. You&apos;ll review everything before it saves.</DialogDescription>
              </DialogHeader>
              <VoiceRecorder onRecorded={setPendingAudio} />
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setPhase("chooser"); setPendingAudio(null) }}>Back</Button>
                <Button type="button" onClick={onTranscribeAndAnalyse} disabled={!pendingAudio}>
                  <Sparkles className="size-4" /> Transcribe &amp; analyse
                </Button>
              </DialogFooter>
            </>
          )}

          {phase === "input" && (
            <>
              <DialogHeader>
                <DialogTitle>Generate from a document</DialogTitle>
                <DialogDescription>Paste the text, or drop a text file. You&apos;ll review everything before it saves.</DialogDescription>
              </DialogHeader>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm transition ${dragging ? "border-primary bg-accent" : "border-muted-foreground/30"}`}
              >
                <UploadCloud className="size-5 text-muted-foreground" />
                {fileName ? <span className="font-medium">{fileName}</span> : <span>Drop a PDF, DOCX, image, or text file here, or click to choose</span>}
                <span className="text-xs text-muted-foreground">.pdf, .docx, .png, .jpg, .txt, .eml, .md · max 50&nbsp;MB</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.eml,.md,.markdown,.csv,.log,.json,.png,.jpg,.jpeg,.webp,.gif,application/pdf,text/*,image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
                />
              </div>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setFileName(null); setPendingFile(null); setPendingImage(null) }}
                placeholder="…or paste the RFP / email chain here."
                rows={7}
                className="w-full resize-y rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPhase("chooser")}>Back</Button>
                <Button type="button" onClick={onAnalyse} disabled={!text.trim() && !pendingFile}>
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
        createAction={wrappedCreate}
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
