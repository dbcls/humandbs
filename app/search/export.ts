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

/** The file to download, and the plain text that goes to the clipboard. */
export type ExportFormat = "copy" | "tsv"

/** What a spreadsheet reads as the start of a formula rather than as text. */
const READS_AS_FORMULA = /^[=+\-@\t\r]/

/**
 * A value a spreadsheet will not evaluate.
 *
 * **Both forms exist to be opened in a spreadsheet** — the file carries a
 * byte-order mark for exactly that, and the clipboard form is pasted into
 * one — so the way the spreadsheet reads them is part of writing them. A title
 * beginning `=` or `@` is a formula there, and titles are free text a provider
 * wrote. The leading apostrophe is what OWASP recommends: the cell reads as
 * text and the apostrophe itself is not shown.
 *
 * Quoting would not help — a spreadsheet evaluates `"=1+1"` too — and the
 * machine-readable route is the JSON API, which is untouched by this.
 */
export function spreadsheetSafe(value: string): string {
  return READS_AS_FORMULA.test(value) ? `'${value}` : value
}

/**
 * Tab-separated, with nothing quoted.
 *
 * **The tab is what keeps the values whole.** A cell that carries several
 * values joins them with a comma, so a comma-separated file would have to quote
 * a third of what a listing hands over — while a tab appears in none of it.
 *
 * **There is no quoting to fall back on here.** What reads a paste does not
 * honour it, and neither do the tools that read a file a column at a time, so a
 * tab or a newline inside a value would silently start a new column or a new
 * row. Both become a space: the line break is lost and the table survives.
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
 * The file carries a byte-order mark: without one Excel reads a UTF-8 file as
 * the local codepage and every Japanese title in it turns to mojibake. **What
 * is copied does not** — it is going to the clipboard rather than to a reader
 * of files, and the mark would arrive as a character in the first cell.
 */
export function exportResponse(
  table: ExportTable,
  name: string,
  format: ExportFormat,
): Response {
  const written = toTsv(table)
  if (format === "copy") {
    return new Response(written, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  const BOM = "﻿"
  return new Response(`${BOM}${written}`, {
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.tsv"`,
    },
  })
}
