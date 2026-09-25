/**
 * Where each file the old portal served goes in the file store, or why it does
 * not go at all.
 *
 * The old portal kept every file under one directory, most of them in a
 * directory per research, some loose beside them. The census lists every one
 * with its size and whether it sits in a research's directory. From that alone this
 * decides, file by file:
 *
 * - **what is not copied**: copies of data kept in another form (the stain-
 *   wise and case-wise copies of hum0181's slides, hum0185's stain-wise zips),
 *   versions a later version replaced (hum0014 v16 and v17's BC), the unpacked
 *   copies beside hum0009's zips, hum0014's superseded notes, 47-byte
 *   placeholder pages, working files and checksums (the store's own checksum
 *   takes that role), and everything loose outside a research's directory except the two files
 *   article bodies link to;
 * - **what is not public**: the prefix of a research that was never published
 *   (hum0185), and one file named after a dataset that was never published;
 * - **the key**: a research's prefix is flat, so a file keeps its name and loses
 *   any directory under the research's directory. Two files that would land on one key are refused
 *   rather than one of them lost.
 *
 * The old article assets (`public-files`) keep their paths under `common/`,
 * which is what the article bodies were rewritten to point at.
 */

import { commonPrefix, PRIVATE_BUCKET, privatePrefix, PUBLIC_BUCKET, publicPrefix } from "~/files/prefix"

/** One file of the census, in the census's own JSON shape. */
export interface CensusEntry {
  size: number
  /** Whether the file sits in a research's directory. The key is the census's own. */
  in_box: boolean
}

function inResearchDirectory(entry: CensusEntry): boolean {
  return entry.in_box
}

export type Census = Record<string, CensusEntry>

export type DropReason
  = | "outside-research-directory"
    | "placeholder"
    | "working-file"
    | "duplicate"
    | "superseded"
    | "unpacked-copy"

export interface PlannedCopy {
  /** The path under the old portal's directory. */
  source: string
  size: number
  bucket: typeof PUBLIC_BUCKET | typeof PRIVATE_BUCKET
  key: string
}

export interface CopyPlan {
  copy: PlannedCopy[]
  dropped: { source: string, size: number, reason: DropReason }[]
}

/** Loose files that article bodies link to, and so move into `common/`. */
const LINKED_LOOSE = new Set(["NBDCform2_access_e.xls", "GenomeScience_e_20150303.pdf"])

const WORKING_FILES = new Set([".DS_Store", "md5sum.HDD.txt", "md5sum.txt", "replace_filelist_hum0197_更3.v2.xls"])

/** hum0014's notes that later ones replaced, none of them linked from anywhere. */
const SUPERSEDED_NOTES = new Set([
  "hum0014/Disease49_b000.xlsx",
  "hum0014/hum0014_jsnp_header_definition.xlsx",
  "hum0014/hum0014_README_FinalReport_170908.pdf",
  "hum0014/README_hum0014_v15_ht_v1.html",
  "hum0014/hum0014_README_BMI_GWAS_170901.pdf",
  "hum0014/hum0014_README_blast_information_170908.pdf",
])

/** Research whose prefix is kept out of public reach: never published. */
const UNPUBLISHED_PREFIXES = new Set(["hum0185"])

/** Files named after a dataset that was never published, in a published prefix. */
const UNPUBLISHED_FILES = new Set(["hum0197/hum0197.v7.covid19-umi.v1.zip"])

const PLACEHOLDER_SIZE = 47

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

export function dropReason(path: string, entry: CensusEntry): DropReason | null {
  const name = nameOf(path)
  if (!inResearchDirectory(entry)) return LINKED_LOOSE.has(path) ? null : "outside-research-directory"
  if (name === "index.html" && entry.size === PLACEHOLDER_SIZE) return "placeholder"
  if (WORKING_FILES.has(name)) return "working-file"
  if (path.startsWith("hum0181/") && (path.split("/").length > 2 || name.startsWith("hum0181.v1.apcc.v1."))) {
    return "duplicate"
  }
  if (/^hum0185\/hum0185\.v1\.ap\.v1\..*_svs_files\.zip$/.test(path)) return "duplicate"
  if (path.startsWith("hum0014/hum0014.v16.") || path === "hum0014/hum0014.v17.BC.v1.zip") return "superseded"
  if (SUPERSEDED_NOTES.has(path)) return "superseded"
  if (path.startsWith("hum0009/") && /\.(tab|doc)$/.test(name)) return "unpacked-copy"
  return null
}

/**
 * The plan for every file of the census. `researchIdOf` names the research
 * behind a prefix: a private prefix is keyed by research identity, because a
 * research may be in the store before it has a hum label.
 */
export function planCopy(census: Census, researchIdOf: (humLabel: string) => string | undefined): CopyPlan {
  const plan: CopyPlan = { copy: [], dropped: [] }
  const taken = new Map<string, string>()
  for (const [source, entry] of Object.entries(census).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const reason = dropReason(source, entry)
    if (reason !== null) {
      plan.dropped.push({ source, size: entry.size, reason })
      continue
    }
    const one = destinationOf(source, entry, researchIdOf)
    const held = taken.get(`${one.bucket}/${one.key}`)
    if (held !== undefined) throw new Error(`${source} and ${held} would both be ${one.bucket}/${one.key}`)
    taken.set(`${one.bucket}/${one.key}`, source)
    plan.copy.push(one)
  }
  return plan
}

function destinationOf(source: string, entry: CensusEntry, researchIdOf: (humLabel: string) => string | undefined): PlannedCopy {
  const name = nameOf(source)
  if (!inResearchDirectory(entry)) return { source, size: entry.size, bucket: PUBLIC_BUCKET, key: `${commonPrefix()}${name}` }
  const directory = source.slice(0, source.indexOf("/"))
  if (UNPUBLISHED_PREFIXES.has(directory) || UNPUBLISHED_FILES.has(source)) {
    const researchId = researchIdOf(directory)
    if (researchId === undefined) throw new Error(`${source} belongs to ${directory}, which is not a research`)
    return { source, size: entry.size, bucket: PRIVATE_BUCKET, key: `${privatePrefix(researchId)}${name}` }
  }
  return { source, size: entry.size, bucket: PUBLIC_BUCKET, key: `${publicPrefix(directory)}${name}` }
}

/** The old article assets, under `common/` at the paths the bodies point at. */
export function planAssets(paths: readonly string[], sizeOf: (path: string) => number): PlannedCopy[] {
  return paths.map((path) => ({ source: path, size: sizeOf(path), bucket: PUBLIC_BUCKET, key: `${commonPrefix()}${path}` }))
}
