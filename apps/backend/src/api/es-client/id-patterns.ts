/**
 * Free-text query ID classification.
 *
 * Single source of truth for the ID namespaces the search box recognises. A
 * query token matching one of these shapes is routed to an exact term / prefix
 * lookup on `humId` / `datasetId` instead of the `all_text` full-text match, so
 * an ID query is never pulled in by a similar string sitting in document body
 * text (the reason fuzziness was dropped — see docs/api-guide.md § 全文一致のセマンティクス).
 *
 * Patterns are derived from the production corpus (research `humId` + 6 dataset
 * forms). A new external dataset source may introduce a new accession namespace;
 * extend `DATASET_ID_REGEXPS` here and the coverage guard in
 * `query-builders.test.ts`. This is intentionally separate from the narrower
 * `EXTERNAL_ID_REGEX` in `api/types/templates.ts` (which only admits JGAD / DRA
 * for the template endpoint) and from the crawler's `config/patterns.ts`.
 */

export type IdField = "humId" | "datasetId"

// research humId: `hum` + digits (e.g. `hum0001`). Always bare — the dotted
// `hum…` form below is a datasetId, distinguished by its trailing `.v<digits>`.
const HUM_ID_REGEXP = /^hum\d+$/i

const DATASET_ID_REGEXPS: readonly RegExp[] = [
  /^JGAD\d+$/i,
  /^DRA\d+$/i,
  /^E-GEAD-\d+$/i,
  /^MTBKS\d+$/i,
  /^PRJDB\d+$/i,
  // NBDC dataset: `hum<digits>` then a dotted suffix ending in `.v<digits>`
  // (e.g. `hum0013.v1.freq.v1`, `hum0009v1.CpG.v1`). The trailing `.v<digits>`
  // keeps it disjoint from a bare humId.
  /^hum\d+.*\.v\d+$/i,
]

/**
 * Classify a single whitespace-delimited query token as an ID field, or `null`
 * when it is not ID-shaped (natural language / gene name / assembly etc.).
 *
 * The token only needs to match the namespace shape; the caller's prefix query
 * handles partial typing (e.g. `JGAD00`, `hum000`, `E-GEAD-10`).
 */
export const classifyIdToken = (token: string): IdField | null => {
  if (HUM_ID_REGEXP.test(token)) return "humId"
  if (DATASET_ID_REGEXPS.some((re) => re.test(token))) return "datasetId"

  return null
}
