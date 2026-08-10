/**
 * The upstream correspondence between hum labels and JGA accessions.
 *
 * This is not part of the v1 dump: it is a cache of what the JGA application
 * system says, and in production a batch will refresh it. The development data
 * seeds it from the two tab-separated files the current nightly job already
 * produces, so that the endpoint that supplies the correspondence to DDBJ
 * Search, and the check the publish gate runs against it, both have the real
 * thing to work against rather than something invented.
 *
 * The files carry no header and two columns, accession then hum label. A line
 * that does not look like that is skipped rather than fatal — the portal is a
 * reader of this data, not its owner, and refusing to load because one line
 * upstream is malformed would put the portal's own development at the mercy of
 * a system it does not control.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const INPUT = join(import.meta.dirname, "input")

export type AccessionKind = "jga-study" | "jga-dataset"

export interface HumAccessionRow {
  accession: string
  humLabel: string
  kind: AccessionKind
}

const FILES: Record<AccessionKind, string> = {
  "jga-study": "jga_study_hum_id.tsv",
  "jga-dataset": "jga_dataset_hum_id.tsv",
}

function readPairs(file: string, kind: AccessionKind): HumAccessionRow[] {
  const raw = readFileSync(join(INPUT, file), "utf8")
  return raw.split("\n").flatMap((line) => {
    const [accession, humLabel] = line.split("\t")
    if (accession === undefined || humLabel === undefined) return []
    if (accession === "" || humLabel === "") return []
    return [{ accession, humLabel: humLabel.trim(), kind }]
  })
}

/**
 * Both files as one list. An accession appearing twice keeps its first row: the
 * table is keyed by accession, and upstream naming one accession for two
 * researches is a disagreement to report rather than one to store twice.
 */
export function loadHumAccessions(): HumAccessionRow[] {
  const rows = [...readPairs(FILES["jga-study"], "jga-study"), ...readPairs(FILES["jga-dataset"], "jga-dataset")]
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.accession)) return false
    seen.add(row.accession)
    return true
  })
}
