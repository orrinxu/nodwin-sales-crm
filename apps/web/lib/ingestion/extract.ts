import type { TextSegment } from "./chunk"
import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf"
import mammoth from "mammoth"

const PDF_MIME = "application/pdf"
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/** Minimal shape needed to extract text — a Drive file satisfies it structurally. */
export interface ExtractableFile {
  bytes: Uint8Array
  mimeType: string
}

// Text extraction handles text/*, PDF (unpdf), and DOCX (mammoth). Anything else
// that needs a binary parser (PPTX) or OCR (text-in-images, scanned decks) is
// still OUT OF SCOPE. Google-native Docs/Slides work here as long as the Drive
// client exports them to a text/* MIME type before handing bytes over.

export class UnsupportedMimeError extends Error {
  constructor(public readonly mimeType: string) {
    super(
      `Text extraction does not support "${mimeType}". Handles text/*, PDF, and ` +
        `DOCX; PPTX parsing and OCR are follow-ups.`,
    )
    this.name = "UnsupportedMimeError"
  }
}

const TEXT_MIME_PREFIXES = ["text/"]
const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/x-ndjson",
])

export function isNativelyExtractable(mimeType: string): boolean {
  const m = mimeType.split(";")[0].trim().toLowerCase()
  return TEXT_MIME_PREFIXES.some((p) => m.startsWith(p)) || TEXT_MIME_EXACT.has(m)
}

/**
 * Extract text segments from a transiently-fetched Drive file. Returns one
 * segment for plain text (no page refs available natively). Throws
 * UnsupportedMimeError for formats that need a parser — the worker marks the
 * document 'failed' with that message rather than indexing garbage.
 */
export async function extractText(file: ExtractableFile): Promise<TextSegment[]> {
  const mime = file.mimeType.split(";")[0].trim().toLowerCase()
  if (mime === PDF_MIME) {
    return extractPdf(file.bytes)
  }
  if (mime === DOCX_MIME) {
    return extractDocx(file.bytes)
  }
  if (!isNativelyExtractable(file.mimeType)) {
    throw new UnsupportedMimeError(file.mimeType)
  }
  const text = new TextDecoder("utf-8").decode(file.bytes)
  return [{ text }]
}

/** Extract a DOCX's text via mammoth (raw text, no styling). One segment;
 *  DOCX carries no reliable page boundaries natively. */
async function extractDocx(bytes: Uint8Array): Promise<TextSegment[]> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  const text = value.trim()
  return text.length > 0 ? [{ text }] : []
}

/** Extract a PDF's text page-by-page via unpdf (pdf.js, no native deps). One
 *  segment per non-empty page, carrying a "p.N" ref onto the chunk for
 *  citations. Scanned/image-only PDFs yield no text (OCR is a follow-up). */
async function extractPdf(bytes: Uint8Array): Promise<TextSegment[]> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await unpdfExtractText(pdf, { mergePages: false })
  const pages = Array.isArray(text) ? text : [text]
  return pages
    .map((t, i) => ({ ref: `p.${i + 1}`, text: (t ?? "").trim() }))
    .filter((seg) => seg.text.length > 0)
}
