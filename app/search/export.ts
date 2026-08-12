/**
 * A listing handed over as a table.
 *
 * Two forms, because the two things a reader does with a result set are open it
 * in a spreadsheet and paste it into one. **Neither is a workbook**: writing an
 * `.xlsx` means a dependency, and every spreadsheet reads what is here.
 *
 * The rows are strings by the time they arrive. Deciding what a column says is
 * the listing's business (`app/public/lists.server.ts`); this file only knows
 * how to write a table down without breaking it.
 */

export interface ExportTable {
  headers: string[]
  rows: string[][]
}

export type ExportFormat = "copy" | "csv"

/** A value has to be quoted if it carries a separator, a quote, or a newline. */
const NEEDS_QUOTING = /["\n\r,]/

/** What a spreadsheet reads as the start of a formula rather than as text. */
const READS_AS_FORMULA = /^[=+\-@\t\r]/

/**
 * A value a spreadsheet will not evaluate.
 *
 * **Both of these files exist to be opened in a spreadsheet** — the CSV carries
 * a byte-order mark for exactly that, and the clipboard form is pasted into
 * one — so the way the spreadsheet reads them is part of writing them. A title
 * beginning `=` or `@` is a formula there, and titles are free text a provider
 * wrote. The leading apostrophe is what OWASP recommends: the cell reads as
 * text and the apostrophe itself is not shown.
 *
 * Quoting does not help — a spreadsheet evaluates `"=1+1"` too — and the
 * machine-readable route is the JSON API, which is untouched by this.
 */
export function spreadsheetSafe(value: string): string {
  return READS_AS_FORMULA.test(value) ? `'${value}` : value
}

function csvValue(value: string): string {
  const safe = spreadsheetSafe(value)
  return NEEDS_QUOTING.test(safe) ? `"${safe.replaceAll("\"", "\"\"")}"` : safe
}

/**
 * RFC 4180: comma-separated, CRLF between records, quotes doubled inside a
 * quoted value. A value keeps its own line breaks — they survive the quoting,
 * and a spreadsheet puts them back into the cell.
 */
export function toCsv(table: ExportTable): string {
  return [table.headers, ...table.rows]
    .map((row) => row.map(csvValue).join(","))
    .join("\r\n")
}

/**
 * Tab-separated, for pasting straight into a sheet.
 *
 * **There is no quoting here**, because what reads a paste does not honour it:
 * a tab or a newline inside a value would silently start a new column or a new
 * row. Both become a space, which loses the line break and keeps the table.
 */
export function toTsv(table: ExportTable): string {
  const oneLine = (value: string) => spreadsheetSafe(value).replaceAll(/[\t\r\n]+/g, " ")
  return [table.headers, ...table.rows]
    .map((row) => row.map(oneLine).join("\t"))
    .join("\n")
}

/**
 * The file, named after the listing it came from.
 *
 * The CSV carries a byte-order mark: without one Excel reads a UTF-8 file as
 * the local codepage and every Japanese title in it turns to mojibake. What is
 * copied is plain text and never a download — it is going to the clipboard.
 */
export function exportResponse(
  table: ExportTable,
  name: string,
  format: ExportFormat,
): Response {
  if (format === "copy") {
    return new Response(toTsv(table), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  const BOM = "\uFEFF"
  return new Response(`${BOM}${toCsv(table)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    },
  })
}
