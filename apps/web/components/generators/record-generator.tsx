"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Plus, FileText, Sparkles, PencilLine, UploadCloud, Loader2, CheckCircle2, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { GeneratorReviewBanner, type GeneratorReviewResult } from "@/components/generators/review-banner"
import { VoiceRecorder } from "@/components/generators/voice-recorder"

// Shared "generate a record from a note" shell (ORR-735). Factored out of the
// opportunity generator so account/contact generators reuse the same chooser →
// input (paste/drop text/PDF/DOCX/image) → analysing → review flow, then hand off
// to the record's existing create form (pre-filled + banner) via `renderForm`.
// Never creates — the form's own createAction commits. No file/provenance side
// effects here (opportunity keeps those in its own wrapper).

export type ImagePayload = { mimeType: string; dataBase64: string }
export interface ExtractFileResult { ok: boolean; text?: string; error?: string }
export interface TranscribeAudioResult {
  ok: boolean
  text?: string
  unconfigured?: boolean
  unavailable?: boolean
  error?: string
}

/** The result shape every Generate*Result satisfies — enough for the banner + prefill. */
export interface GeneratorResult<Prefill> extends GeneratorReviewResult {
  ok: boolean
  prefill?: Prefill
  unconfigured?: boolean
  error?: string
}

interface RecordGeneratorProps<Prefill, Result extends GeneratorResult<Prefill>> {
  /** Lowercase noun for copy, e.g. "account". */
  entityLabel: string
  /** The primary button label, e.g. "Create Account". */
  createLabel: string
  generateAction: (input: { text?: string; images?: ImagePayload[] }) => Promise<Result>
  /** Server-side text extraction for PDF/DOCX. When absent, only text/images work. */
  extractFileAction?: (formData: FormData) => Promise<ExtractFileResult>
  /** Server-side voice transcription (ORR-741). When present, the chooser offers a
   *  "record a voice note" path; the transcript feeds the same text pipeline.
   *  Pages pass this only when a transcription endpoint is configured + enabled. */
  transcribeAction?: (formData: FormData) => Promise<TranscribeAudioResult>
  /** Field-key → label map for the review banner. */
  fieldLabels: Record<string, string>
  /** Render the record's create form, controlled. `result` is null for the
   *  fill-it-myself path; `banner` is the review banner (undefined when blank).
   *  Apply `key={formKey}` to the form so it remounts (re-seeds RHF defaults) on
   *  each new generation. */
  renderForm: (args: {
    formKey: number
    open: boolean
    onOpenChange: (open: boolean) => void
    result: Result | null
    banner: ReactNode
  }) => ReactNode
}

type Phase = "idle" | "chooser" | "input" | "record" | "analysing" | "error"

const ANALYSE_STEPS = ["Reading note", "Extracting fields", "Matching to your records"]
const TEXT_FILE = /\.(txt|eml|md|markdown|csv|log|json|text)$/i
const BINARY_FILE = /\.(pdf|docx)$/i
const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

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
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function RecordGenerator<Prefill, Result extends GeneratorResult<Prefill>>({
  entityLabel,
  createLabel,
  generateAction,
  extractFileAction,
  transcribeAction,
  fieldLabels,
  renderForm,
}: RecordGeneratorProps<Prefill, Result>) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [text, setText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingImage, setPendingImage] = useState<ImagePayload | null>(null)
  const [pendingAudio, setPendingAudio] = useState<Blob | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [analyseStep, setAnalyseStep] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  function reset() {
    setText("")
    setFileName(null)
    setPendingFile(null)
    setPendingImage(null)
    setPendingAudio(null)
    setErrorMsg(null)
    setAnalyseStep(0)
  }

  function openForm(res: Result | null) {
    setResult(res)
    setFormKey((k) => k + 1)
    setFormOpen(true)
    setPhase("idle")
    reset()
  }

  const handleFile = useCallback(async (file: File) => {
    const isText = TEXT_FILE.test(file.name) || file.type.startsWith("text/")
    const isBinary = BINARY_FILE.test(file.name) || file.type === "application/pdf" || file.type === DOCX_MIME
    const isImage = isImageFile(file)
    if (!isText && !isBinary && !isImage) {
      setErrorMsg("Drop a PDF, DOCX, image, or text file (.txt, .eml, .md), or paste the text below.")
      return
    }
    setErrorMsg(null)
    setFileName(file.name)
    if (isText) {
      setPendingFile(null)
      setPendingImage(null)
      setText(await file.text())
    } else if (isBinary) {
      setText("")
      setPendingImage(null)
      setPendingFile(file)
    } else {
      setText("")
      setPendingFile(null)
      setPendingImage({ mimeType: imageMime(file), dataBase64: await fileToBase64(file) })
    }
  }, [])

  useEffect(() => {
    if (phase !== "input") return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
    const onDragLeave = (e: DragEvent) => { if (e.relatedTarget === null) setDragging(false) }
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
      setErrorMsg("Paste or drop a note first.")
      return
    }
    setPhase("analysing")
    setErrorMsg(null)
    setAnalyseStep(0)
    const t1 = setTimeout(() => setAnalyseStep(1), 1200)
    const t2 = setTimeout(() => setAnalyseStep(2), 3200)
    try {
      let res: Result
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
        setErrorMsg(res.error ?? "The note could not be read. Try pasting a clearer version.")
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
      // The transcript is just text — reuse the exact pipeline the paste path uses.
      const res = await generateAction({ text: tr.text })
      clearTimeout(t1)
      clearTimeout(t2)
      if (!res.ok) {
        setPhase("error")
        setErrorMsg(res.error ?? "The note could not be read. Try again, or type it out.")
        return
      }
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
            <p className="mt-2 font-medium">Drop your note to analyse</p>
          </div>
        </div>
      )}
      <Button onClick={() => { reset(); setPhase("chooser") }}>
        <Plus className="size-4" />
        {createLabel}
      </Button>

      <Dialog open={chooserOpen} onOpenChange={(o) => { if (!o) { setPhase("idle"); reset() } }}>
        <DialogContent className="sm:max-w-lg">
          {phase === "chooser" && (
            <>
              <DialogHeader>
                <DialogTitle>Create {entityLabel}</DialogTitle>
                <DialogDescription>Start from scratch, or let AI pre-fill it from a note.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => { setPhase("idle"); openForm(null) }}
                  className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent"
                >
                  <PencilLine className="size-5 text-muted-foreground" />
                  <span className="font-medium">Fill it out myself</span>
                  <span className="text-xs text-muted-foreground">Open a blank {entityLabel} form.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("input")}
                  className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent"
                >
                  <Sparkles className="size-5 text-muted-foreground" />
                  <span className="font-medium">Generate from a note</span>
                  <span className="text-xs text-muted-foreground">Paste or drop a note — AI pre-fills the form.</span>
                </button>
                {transcribeAction && (
                  <button
                    type="button"
                    onClick={() => { reset(); setPhase("record") }}
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
                <DialogDescription>Speak naturally about the {entityLabel}. You&apos;ll review everything before it saves.</DialogDescription>
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
                <DialogTitle>Generate from a note</DialogTitle>
                <DialogDescription>Paste the text, or drop a file. You&apos;ll review everything before it saves.</DialogDescription>
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
                placeholder={`…or paste a note about the ${entityLabel} here.`}
                rows={7}
                className="w-full resize-y rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPhase("chooser")}>Back</Button>
                <Button type="button" onClick={onAnalyse} disabled={!text.trim() && !pendingFile && !pendingImage}>
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

      {renderForm({
        formKey,
        open: formOpen,
        onOpenChange: setFormOpen,
        result,
        banner: result ? <GeneratorReviewBanner result={result} fieldLabels={fieldLabels} /> : undefined,
      })}
    </>
  )
}
