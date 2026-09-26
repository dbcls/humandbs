/**
 * The labels the files of each research's prefix start with: the words a reader is shown beside
 * a file, in each language.
 *
 * The old pages said what a file was only in the words of the link to it — `Dictionary file`,
 * `SNVアレル頻度（常染色体）`, a trait's name in a table of downloads. Those words were
 * gathered by hand into `hand/file-labels.json`, one entry per file, and each becomes the
 * file's label.
 *
 * **An entry for a file the store will not hold stops the load**, as does one for no research,
 * a name with a directory in it, the same file twice, or no words in either language: the table
 * was written against the files and the pages, and an entry that finds nothing means one of the
 * two has moved.
 */

export interface FileLabelEntry {
  hum: string
  /** The name in the research's prefix, as the store keys it. */
  name: string
  ja: string
  en: string
}

export interface FileLabelRow {
  researchId: string
  fileName: string
  labelJa: string
  labelEn: string
}

export function fileLabelRows(
  entries: readonly FileLabelEntry[],
  researchIdOf: (hum: string) => string | undefined,
  stored: (hum: string, name: string) => boolean,
): FileLabelRow[] {
  const seen = new Set<string>()
  return entries.map((entry) => {
    const where = `${entry.hum}/${entry.name}`
    const labelJa = entry.ja.trim()
    const labelEn = entry.en.trim()
    if (entry.name === "" || entry.name.includes("/")) throw new Error(`file label ${where}: not a name in a prefix`)
    if (labelJa === "" && labelEn === "") throw new Error(`file label ${where}: no words in either language`)
    if (seen.has(where)) throw new Error(`file label ${where}: given twice`)
    seen.add(where)
    const researchId = researchIdOf(entry.hum)
    if (researchId === undefined) throw new Error(`file label ${where}: ${entry.hum} is not a research`)
    if (!stored(entry.hum, entry.name)) throw new Error(`file label ${where}: the store will not hold this file`)
    return { researchId, fileName: entry.name, labelJa, labelEn }
  })
}
