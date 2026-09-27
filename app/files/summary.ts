/**
 * How much data a dataset holds and in what formats, read off its files.
 *
 * **Two sources, by who issued the dataset's ID.** An archive's dataset (JGA,
 * DRA, GEA, MetaboBank) has its files in the archive, and the refresh keeps
 * their sum and formats (`accession_file_summary`). A dataset the portal issued
 * the ID for has its files in the research's prefix, selected by name: the
 * formats are read off the names, and the size is the sum of the selected
 * files the listing has.
 *
 * **No size rather than zero.** A dataset with no file, and one whose files
 * could not be listed because the store did not answer, both have no size: a
 * zero would read as a dataset that is known to be empty.
 */

import { isPortalIssuedId } from "~/admin/labels"

import { FILE_FORMATS, readFileNames, sortFormats } from "./formats"

export interface FileSummary {
  /** Bytes, or null when it cannot be told. */
  byteCount: number | null
  /** `file-type` codes in the list's order. */
  formats: string[]
}

/** What the refresh holds for an archive's dataset: a row of `accession_file_summary`. */
export interface ArchiveFiles {
  byteCount: number
  formats: readonly string[]
}

export const NO_FILES: FileSummary = { byteCount: null, formats: [] }

export function datasetFileSummary(input: {
  /** The dataset's primary ID, which tells whose files they are. Empty while none is pinned. */
  label: string
  selection: readonly string[]
  /** The research's prefix as listed, or null when the store did not answer. */
  listing: readonly { name: string, size: number }[] | null
  /** The archive's row, for an archive's dataset; null when the archive has no files for it. */
  archive: ArchiveFiles | null
}): FileSummary {
  if (!isPortalIssuedId(input.label === "" ? null : input.label)) {
    return input.archive === null
      ? NO_FILES
      : { byteCount: input.archive.byteCount, formats: sortFormats(input.archive.formats) }
  }
  const chosen = new Set(input.selection)
  const present = (input.listing ?? []).filter((file) => chosen.has(file.name))
  return {
    byteCount: present.length === 0 ? null : present.reduce((total, file) => total + file.size, 0),
    formats: readFileNames(chosen).formats,
  }
}

/** A research's formats: those of its datasets, each once. */
export function formatsOfAll(datasets: readonly (readonly string[])[]): string[] {
  return sortFormats(datasets.flat())
}

const LABEL_OF: ReadonlyMap<string, string> = new Map(FILE_FORMATS.map((one) => [one.code, one.label]))

/**
 * What a format is called, in either language. A code the list no longer has
 * is shown as it is: it can only be a row the refresh wrote before the list
 * changed, and the next refresh replaces it.
 */
export function formatLabel(code: string): string {
  return LABEL_OF.get(code) ?? code
}
