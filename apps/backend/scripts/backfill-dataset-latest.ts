/**
 * Backfill the Dataset index's latest-version flags.
 *
 * Search, aggregation and filtering are scoped to `isLatest` /
 * `isLatestPublished` ([data-model.md § 最新版フラグ]). Documents indexed before
 * those fields existed carry neither, and a scoped query does not match them —
 * so an index has to be backfilled *before* the code that reads the flags is
 * deployed. The reverse order is harmless: the running code ignores fields it
 * does not know about.
 *
 * The mapping is applied first, in this same script rather than by hand. The
 * indices are `dynamic: false`, so values written without a mapping land in
 * `_source` but are never indexed, and adding the mapping afterwards does not
 * reach back to them — the backfill would have to be run twice with no visible
 * sign that the first run did nothing.
 *
 * Usage (from inside the backend container):
 *   bun run scripts/backfill-dataset-latest.ts                # dry run
 *   bun run scripts/backfill-dataset-latest.ts --apply
 *   bun run scripts/backfill-dataset-latest.ts --verify-only  # no writes
 *
 * Target index: `HUMANDBS_ES_INDEX_DATASET` / `HUMANDBS_ES_INDEX_RESEARCH`
 * (defaults `dataset` / `research`), so the same script serves the `-it`
 * indices and staging / production alike.
 */
import { esClient, ES_INDEX } from "@/api/es-client/client"
import { computeDatasetLatestFlags, groupByDatasetId } from "@/es/dataset-latest"
import type { DatasetLatestFlags } from "@/es/dataset-latest"

const ACCEPTED_ARGS = new Set(["--apply", "--verify-only"])
const rawArgs = process.argv.slice(2)
const unknownArgs = rawArgs.filter(a => !ACCEPTED_ARGS.has(a))
if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(", ")}. Accepted: ${[...ACCEPTED_ARGS].join(", ")}`)
  process.exit(1)
}
const APPLY = rawArgs.includes("--apply")
const VERIFY_ONLY = rawArgs.includes("--verify-only")

const SCAN_PAGE = 1000
const BULK_BATCH = 500

interface DatasetRow {
  esId: string
  datasetId: string
  version: string
  humId: string
  humVersionId: string
  isLatest?: boolean
  isLatestPublished?: boolean
}

/** Add the two boolean fields to the live mapping. Additive, so idempotent. */
const ensureMapping = async (): Promise<void> => {
  await esClient.indices.putMapping({
    index: ES_INDEX.dataset,
    properties: {
      isLatest: { type: "boolean" },
      isLatestPublished: { type: "boolean" },
    },
  })
  console.log(`Mapping ensured on ${ES_INDEX.dataset}`)
}

/** Every Dataset doc, in `datasetId` + `version` order so paging is stable. */
const scanDatasets = async (): Promise<DatasetRow[]> => {
  const rows: DatasetRow[] = []
  let searchAfter: unknown[] | undefined

  for (;;) {
    const res = await esClient.search<Omit<DatasetRow, "esId">>({
      index: ES_INDEX.dataset,
      size: SCAN_PAGE,
      query: { match_all: {} },
      sort: [{ datasetId: "asc" }, { version: "asc" }],
      search_after: searchAfter,
      _source: ["datasetId", "version", "humId", "humVersionId", "isLatest", "isLatestPublished"],
      track_total_hits: false,
    })
    const hits = res.hits.hits
    if (hits.length === 0) break

    for (const hit of hits) {
      if (!hit._source || hit._id === undefined) continue
      rows.push({ esId: hit._id, ...hit._source })
    }
    searchAfter = hits[hits.length - 1].sort
    if (hits.length < SCAN_PAGE) break
  }

  return rows
}

/**
 * `humId -> latestVersion`, the published ceiling each Dataset is measured
 * against. Read in one pass rather than per datasetId — production has ~500
 * Research docs against ~1200 datasetIds.
 */
const scanCeilings = async (): Promise<Map<string, string | null>> => {
  const res = await esClient.search<{ humId: string; latestVersion: string | null }>({
    index: ES_INDEX.research,
    size: 10000,
    query: { match_all: {} },
    _source: ["humId", "latestVersion"],
    track_total_hits: false,
  })

  const ceilings = new Map<string, string | null>()
  for (const hit of res.hits.hits) {
    if (!hit._source) continue
    ceilings.set(hit._source.humId, hit._source.latestVersion ?? null)
  }

  return ceilings
}

const expectedFlags = (
  rows: DatasetRow[],
  ceilings: Map<string, string | null>,
): Map<string, DatasetLatestFlags> => {
  const expected = new Map<string, DatasetLatestFlags>()
  for (const [, group] of groupByDatasetId(rows)) {
    const flags = computeDatasetLatestFlags(group, ceilings)
    for (const row of group) {
      const f = flags.get(row.version)
      if (f) expected.set(row.esId, f)
    }
  }

  return expected
}

const differs = (row: DatasetRow, flags: DatasetLatestFlags): boolean =>
  row.isLatest !== flags.isLatest || row.isLatestPublished !== flags.isLatestPublished

const applyFlags = async (
  rows: DatasetRow[],
  expected: Map<string, DatasetLatestFlags>,
): Promise<void> => {
  const pending = rows.filter(r => {
    const flags = expected.get(r.esId)
    return flags !== undefined && differs(r, flags)
  })

  for (let i = 0; i < pending.length; i += BULK_BATCH) {
    const batch = pending.slice(i, i + BULK_BATCH)
    const operations = batch.flatMap(row => [
      { update: { _index: ES_INDEX.dataset, _id: row.esId } },
      { doc: expected.get(row.esId) },
    ])
    const res = await esClient.bulk({ operations, refresh: false })
    if (res.errors) {
      const failed = res.items.filter(item => Object.values(item)[0]?.error).slice(0, 5)
      console.error(`Bulk update returned errors: ${JSON.stringify(failed).slice(0, 1000)}`)
      process.exit(1)
    }
    console.log(`  updated ${Math.min(i + BULK_BATCH, pending.length)}/${pending.length}`)
  }

  await esClient.indices.refresh({ index: ES_INDEX.dataset })
}

/**
 * Check the index the way the search paths will read it.
 *
 * The counts come from `term` queries rather than the scanned `_source`, so a
 * missing mapping shows up here as "0 documents match" instead of silently
 * passing.
 */
const verify = async (
  rows: DatasetRow[],
  expected: Map<string, DatasetLatestFlags>,
): Promise<boolean> => {
  const stale = rows.filter(r => {
    const flags = expected.get(r.esId)
    return flags !== undefined && differs(r, flags)
  })

  const datasetIds = new Set(rows.map(r => r.datasetId))
  const expectedPublished = new Set(
    rows.filter(r => expected.get(r.esId)?.isLatestPublished).map(r => r.datasetId),
  )

  const [latestCount, publishedCount] = await Promise.all([
    esClient.count({ index: ES_INDEX.dataset, query: { term: { isLatest: true } } }),
    esClient.count({ index: ES_INDEX.dataset, query: { term: { isLatestPublished: true } } }),
  ])

  console.log(`  docs: ${rows.length}, datasetIds: ${datasetIds.size}`)
  console.log(`  isLatest=true: ${latestCount.count} (expected ${datasetIds.size})`)
  console.log(`  isLatestPublished=true: ${publishedCount.count} (expected ${expectedPublished.size})`)
  console.log(`  docs whose stored flags disagree with the computed ones: ${stale.length}`)

  const problems: string[] = []
  if (stale.length > 0) {
    problems.push(`${stale.length} doc(s) carry flags that differ from the computed value`)
    for (const row of stale.slice(0, 10)) {
      console.log(`    ${row.esId}: stored ${String(row.isLatest)}/${String(row.isLatestPublished)}`
        + ` vs computed ${String(expected.get(row.esId)?.isLatest)}/${String(expected.get(row.esId)?.isLatestPublished)}`)
    }
  }
  if (latestCount.count !== datasetIds.size) {
    problems.push("isLatest=true does not match the datasetId count — a datasetId is either missing a latest version or has two")
  }
  if (publishedCount.count !== expectedPublished.size) {
    problems.push("isLatestPublished=true does not match the number of datasetIds with a published version")
  }

  for (const problem of problems) console.error(`  NG: ${problem}`)

  return problems.length === 0
}

const main = async (): Promise<void> => {
  console.log(`Indices: ${ES_INDEX.dataset} (dataset) / ${ES_INDEX.research} (research)`)
  console.log(`Mode: ${VERIFY_ONLY ? "verify only" : APPLY ? "apply" : "dry run"}`)

  if (APPLY && !VERIFY_ONLY) await ensureMapping()

  const [rows, ceilings] = await Promise.all([scanDatasets(), scanCeilings()])
  const expected = expectedFlags(rows, ceilings)

  const pending = rows.filter(r => {
    const flags = expected.get(r.esId)
    return flags !== undefined && differs(r, flags)
  })
  console.log(`Scanned ${rows.length} doc(s); ${pending.length} need updating`)

  if (APPLY && !VERIFY_ONLY) {
    await applyFlags(rows, expected)
  } else if (!VERIFY_ONLY) {
    for (const row of pending.slice(0, 20)) {
      const flags = expected.get(row.esId)!
      console.log(`  ${row.esId}: ${String(row.isLatest)}/${String(row.isLatestPublished)}`
        + ` -> ${String(flags.isLatest)}/${String(flags.isLatestPublished)}`)
    }
    if (pending.length > 20) console.log(`  ... and ${pending.length - 20} more`)
    console.log("Dry run — pass --apply to write.")
  }

  console.log("Verifying:")
  const fresh = APPLY && !VERIFY_ONLY ? await scanDatasets() : rows
  const ok = await verify(fresh, expectedFlags(fresh, ceilings))
  if (!ok && (APPLY || VERIFY_ONLY)) {
    console.error("Verification failed. Do not deploy the flag-scoped read paths against this index.")
    process.exit(1)
  }

  console.log("Done.")
  process.exit(0)
}

main().catch((err) => {
  console.error("Backfill failed:", err)
  process.exit(1)
})
