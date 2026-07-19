/**
 * Encoding-aware CSV text decoding for the importers (ORR-809 i).
 *
 * `File.text()` always decodes as UTF-8, so an ISO-8859-1 / Windows-1252 or
 * UTF-16 export (common from non-en_US Salesforce orgs and Excel) imports as
 * mojibake ("Müller" → "M�ller") silently. This sniffs a BOM, and for BOM-less
 * files tries strict UTF-8 and falls back to Windows-1252 (a superset of
 * Latin-1) when the bytes aren't valid UTF-8.
 *
 * Client-safe (no server-only): the import cards call this in the browser.
 */

export type DecodedEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252"

export interface DecodedCsv {
  text: string
  encoding: DecodedEncoding
}

export function decodeCsvBuffer(buf: ArrayBuffer): DecodedCsv {
  const bytes = new Uint8Array(buf)
  // BOM sniff — the byte-order mark is authoritative when present.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8-bom" }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16le" }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "utf-16be" }
  }
  // No BOM: prefer strict UTF-8, but fall back rather than emit replacement
  // characters when the bytes aren't valid UTF-8.
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" }
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" }
  }
}

/** Read a picked File and decode it with encoding detection. */
export async function decodeCsvFile(file: File): Promise<string> {
  return decodeCsvBuffer(await file.arrayBuffer()).text
}
