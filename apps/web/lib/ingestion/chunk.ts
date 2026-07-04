// ORR-620: chunking. Deterministic, boundary-aware splitting of extracted text
// into overlapping windows. Char-based as a stand-in for tokens (~4 chars/token),
// which is good enough for v1 and avoids a tokenizer dependency.

export interface ChunkOptions {
  /** Target window size in characters (~1000 tokens). */
  targetChars: number
  /** Overlap between consecutive windows in characters (~15%). */
  overlapChars: number
}

export const CHUNK_DEFAULTS: ChunkOptions = {
  targetChars: 4000, // ≈ 1000 tokens
  overlapChars: 600, // ≈ 150 tokens (15%)
}

/** A unit of extracted text with an optional page/slide reference. */
export interface TextSegment {
  /** e.g. "p.3" or "slide 4"; carried onto the chunk as page_ref. */
  ref?: string
  text: string
}

export interface Chunk {
  index: number
  content: string
  pageRef?: string
}

// How far before the target we allow a boundary cut, to avoid splitting words.
const BOUNDARY_SLACK = 400

/** Find a natural break at or before `hardEnd`, preferring paragraph > line > sentence > space. */
function findBreak(text: string, from: number, hardEnd: number): number {
  const windowStart = Math.max(from, hardEnd - BOUNDARY_SLACK)
  for (const sep of ["\n\n", "\n", ". ", " "]) {
    const idx = text.lastIndexOf(sep, hardEnd)
    if (idx >= windowStart && idx > from) return idx + sep.length
  }
  return hardEnd
}

function chunkOneSegment(
  text: string,
  ref: string | undefined,
  opts: ChunkOptions,
  startIndex: number,
  out: Chunk[],
): void {
  const trimmed = text.trim()
  if (trimmed.length === 0) return

  const { targetChars, overlapChars } = opts
  const step = Math.max(1, targetChars - overlapChars)
  let cursor = 0

  while (cursor < trimmed.length) {
    const hardEnd = Math.min(cursor + targetChars, trimmed.length)
    const end = hardEnd >= trimmed.length ? trimmed.length : findBreak(trimmed, cursor, hardEnd)
    const content = trimmed.slice(cursor, end).trim()
    if (content.length > 0) {
      out.push({ index: startIndex + out.length, content, pageRef: ref })
    }
    if (end >= trimmed.length) break
    cursor = Math.max(cursor + step, end - overlapChars)
  }
}

/** Chunk pre-segmented text (one segment per page/slide, or a single segment). */
export function chunkSegments(segments: TextSegment[], opts: ChunkOptions = CHUNK_DEFAULTS): Chunk[] {
  const out: Chunk[] = []
  for (const seg of segments) {
    chunkOneSegment(seg.text, seg.ref, opts, 0, out)
  }
  // Re-number sequentially across all segments.
  return out.map((c, i) => ({ ...c, index: i }))
}

/** Convenience for un-paginated plain text. */
export function chunkText(text: string, opts: ChunkOptions = CHUNK_DEFAULTS): Chunk[] {
  return chunkSegments([{ text }], opts)
}
