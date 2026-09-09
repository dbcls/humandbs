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
 * A third file carries the edge upstream draws between a dataset and the study
 * it sits under, which the correspondence above cannot be folded back into (a
 * hum holding several studies is the ordinary case).
 *
 * Every file carries no header and two columns. A line that does not look like
 * that is skipped rather than fatal — the portal is a reader of this data, not
 * its owner, and refusing to load because one line upstream is malformed would
 * put the portal's own development at the mercy of a system it does not control.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

const INPUT = join(import.meta.dirname, "input")

export type AccessionKind = "jga-study" | "jga-dataset"

export interface HumAccessionRow {
  accession: string
  humLabel: string
  kind: AccessionKind
  /** The study a dataset sits under. Null on a study, and where upstream has none. */
  study: string | null
}

const FILES: Record<AccessionKind, string> = {
  "jga-study": "jga_study_hum_id.tsv",
  "jga-dataset": "jga_dataset_hum_id.tsv",
}

const STUDY_FILE = "jga_dataset_study.tsv"

/** The two columns of one file, in the order they are written. */
function readColumns(file: string): [string, string][] {
  const raw = readFileSync(join(INPUT, file), "utf8")
  return raw.split("\n").flatMap((line) => {
    const [left, right] = line.split("\t")
    if (left === undefined || right === undefined) return []
    const named = right.trim()
    if (left === "" || named === "") return []
    return [[left, named] as [string, string]]
  })
}

function readPairs(file: string, kind: AccessionKind): HumAccessionRow[] {
  return readColumns(file).map(([accession, humLabel]) => ({
    accession,
    humLabel,
    kind,
    study: null,
  }))
}

/**
 * Both files as one list. An accession appearing twice keeps its first row: the
 * table is keyed by accession, and upstream naming one accession for two
 * researches is a disagreement to report rather than one to store twice.
 */
export function loadHumAccessions(): HumAccessionRow[] {
  return humAccessionRows(
    [...readPairs(FILES["jga-study"], "jga-study"), ...readPairs(FILES["jga-dataset"], "jga-dataset")],
    readColumns(STUDY_FILE),
  )
}

/**
 * The rows the two correspondences make together, with the edge attached.
 *
 * Separate from reading the files so that the cases the files do not happen to
 * contain — an edge into a study nobody published, an accession named twice —
 * can be stated and checked.
 */
export function humAccessionRows(
  pairs: readonly HumAccessionRow[],
  edges: readonly (readonly [string, string])[],
): HumAccessionRow[] {
  const seen = new Set<string>()
  const kept = pairs.filter((row) => {
    if (seen.has(row.accession)) return false
    seen.add(row.accession)
    return true
  })
  // The edge file is drawn over everything registered rather than everything
  // published, so an edge into a study these files do not carry is dropped: the
  // cache holds only what is public, and a page may not name what nobody can open.
  const published = new Set(kept.filter((row) => row.kind === "jga-study").map((row) => row.accession))
  const studies = new Map(edges)
  return kept.map((row) => {
    if (row.kind !== "jga-dataset") return row
    const study = studies.get(row.accession)
    return { ...row, study: study !== undefined && published.has(study) ? study : null }
  })
}
