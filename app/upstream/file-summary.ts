/**
 * Turning what the two file sources fetched into the rows the cache holds: one
 * per dataset, with the size added up and the formats read off the names
 * (`files/formats.ts`).
 *
 * **The extensions that made no format are counted, not dropped silently.**
 * They are what the list of formats is missing, and the refresh reports them
 * so that adding one is a decision somebody can make.
 */

import { readFileName, sortFormats } from "~/files/formats"

import type { ListedFiles } from "./archive-files"
import type { JgadFileGroupUpstreamRow } from "./application-db.server"

export interface FileSummaryRow {
  accession: string
  byteCount: number
  formats: string[]
}

export interface FileSummaries {
  rows: FileSummaryRow[]
  /** How many files ended in each extension that made no format; `""` for no extension. */
  unknown: Map<string, number>
}

function count(unknown: Map<string, number>, extension: string, files: number): void {
  unknown.set(extension, (unknown.get(extension) ?? 0) + files)
}

export function summarizeJgadFiles(groups: readonly JgadFileGroupUpstreamRow[]): FileSummaries {
  const byAccession = new Map<string, { byteCount: number, formats: Set<string> }>()
  const unknown = new Map<string, number>()
  for (const group of groups) {
    const held = byAccession.get(group.accession) ?? { byteCount: 0, formats: new Set<string>() }
    byAccession.set(group.accession, held)
    held.byteCount += group.byteCount
    const reading = readFileName(group.nameEnding)
    if (reading.format !== null) held.formats.add(reading.format)
    else count(unknown, reading.extension, group.fileCount)
  }
  return {
    rows: [...byAccession].map(([accession, held]) => ({
      accession,
      byteCount: held.byteCount,
      formats: sortFormats(held.formats),
    })),
    unknown,
  }
}

/** A dataset the server had nothing for is left out: its page shows neither value. */
export function summarizeListedFiles(listed: readonly { accession: string, files: ListedFiles | null }[]): FileSummaries {
  const unknown = new Map<string, number>()
  const rows = listed.flatMap(({ accession, files }) => {
    if (files === null) return []
    const formats = new Set<string>()
    for (const name of files.names) {
      const reading = readFileName(name)
      if (reading.format !== null) formats.add(reading.format)
      else count(unknown, reading.extension, 1)
    }
    return [{ accession, byteCount: files.byteCount, formats: sortFormats(formats) }]
  })
  return { rows, unknown }
}
