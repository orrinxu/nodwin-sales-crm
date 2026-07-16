import "server-only"

/**
 * Minimal RFC-4180 CSV parser for the Salesforce importer (ORR-699).
 *
 * Salesforce report exports are quoted CSV that routinely contain commas,
 * embedded newlines, and doubled quotes inside fields — so a naive line/comma
 * split corrupts data. This parser handles quoting, escaped quotes (""), CRLF or
 * LF line endings, and a leading UTF-8 BOM. It returns each data row as an object
 * keyed by the (trimmed) header cell, which is what the field-map layer consumes.
 */

export interface ParsedCsv {
  headers: string[]
  /** One object per data row: header → cell value (never undefined; "" when empty). */
  rows: Record<string, string>[]
}

/** Split raw CSV text into a matrix of string cells. */
function toMatrix(text: string): string[][] {
  // Strip a leading BOM if present — Excel/Salesforce often prepend one.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- numeric loop index
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"' // escaped quote
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      // Consume \r\n as a single break; a lone \r or \n also ends the row.
      if (ch === "\r" && input[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }

  // Flush the trailing field/row unless the input ended exactly on a newline.
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

export function parseCsv(text: string): ParsedCsv {
  const matrix = toMatrix(text).filter(
    // Drop fully-blank rows (a trailing newline, or a row of only empty cells).
    (cells) => cells.some((c) => c.trim() !== ""),
  )
  if (matrix.length === 0) return { headers: [], rows: [] }

  const headers = matrix[0].map((h) => h.trim())
  const rows = matrix.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, idx) => {
      // Headers come from the untrusted CSV; skip keys that would mutate the
      // prototype chain. `idx` is a numeric loop index.
      if (header === "__proto__" || header === "constructor") return
      // eslint-disable-next-line security/detect-object-injection -- guarded key, numeric idx
      record[header] = (cells[idx] ?? "").trim()
    })
    return record
  })

  return { headers, rows }
}
