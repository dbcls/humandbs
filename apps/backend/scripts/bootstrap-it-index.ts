/**
 * Bootstrap isolated Elasticsearch indices for mutating integration tests.
 *
 * Two modes:
 *   - default: drop + create the three `*-it` indices using the in-repo
 *     mappings and seed the minimum fixture set (hum0001 / hum0001-v1 /
 *     JGAD000002-v1). Suits empty dev environments.
 *   - `--from-production`: drop + create with the production index's live
 *     mapping (`indices.get_mapping`) and `_reindex` the entire production
 *     index into the `-it` counterpart. Lets the read-only IT suite keep
 *     passing against equivalent data without touching production at runtime.
 *
 * Required env (refuses to run otherwise):
 *   HUMANDBS_INTEGRATION_TEST=1
 *   HUMANDBS_ES_INDEX_RESEARCH=<...>-it
 *   HUMANDBS_ES_INDEX_RESEARCH_VERSION=<...>-it
 *   HUMANDBS_ES_INDEX_DATASET=<...>-it
 *
 * Source production index names are derived by stripping the `-it` suffix.
 *
 * Usage (from inside the backend container):
 *   HUMANDBS_INTEGRATION_TEST=1 \
 *   HUMANDBS_ES_INDEX_RESEARCH=research-it \
 *   HUMANDBS_ES_INDEX_RESEARCH_VERSION=research-version-it \
 *   HUMANDBS_ES_INDEX_DATASET=dataset-it \
 *   bun run scripts/bootstrap-it-index.ts [--from-production]
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync } from "fs"
import { join } from "path"

import { datasetMapping } from "@/es/dataset-schema"
import type { EsMapping } from "@/es/generate-mapping"
import { researchMapping } from "@/es/research-schema"
import { researchVersionMapping } from "@/es/research-version-schema"
import { extractDataText } from "@/es/types"

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "elasticsearch"
const ES_PORT = process.env.HUMANDBS_ES_PORT ?? "9200"
const ES_NODE = `http://${ES_HOST}:${ES_PORT}`

const INTEGRATION_TEST_FLAG = process.env.HUMANDBS_INTEGRATION_TEST ?? ""
const RESEARCH_INDEX = process.env.HUMANDBS_ES_INDEX_RESEARCH ?? ""
const RESEARCH_VERSION_INDEX = process.env.HUMANDBS_ES_INDEX_RESEARCH_VERSION ?? ""
const DATASET_INDEX = process.env.HUMANDBS_ES_INDEX_DATASET ?? ""

const FIXTURE_DIR = join(import.meta.dir, "..", "tests", "fixtures", "es")

const ACCEPTED_ARGS = new Set(["--from-production"])
const rawArgs = process.argv.slice(2)
const unknownArgs = rawArgs.filter(a => !ACCEPTED_ARGS.has(a))
if (unknownArgs.length > 0) {
  console.error(
    `Unknown argument(s): ${unknownArgs.join(", ")}. Accepted: ${[...ACCEPTED_ARGS].join(", ")} (or none for the default minimal-seed mode). Forms like "--from-production=true" or "--from_production" are not recognized.`,
  )
  process.exit(1)
}
const FROM_PRODUCTION = rawArgs.includes("--from-production")

const validateEnv = (): void => {
  if (INTEGRATION_TEST_FLAG !== "1") {
    console.error(
      `Refusing to bootstrap: HUMANDBS_INTEGRATION_TEST=1 is required (got "${INTEGRATION_TEST_FLAG}"). The bootstrap script is for the integration-test isolation indices only.`,
    )
    process.exit(1)
  }
  const missing = [
    !RESEARCH_INDEX && "HUMANDBS_ES_INDEX_RESEARCH",
    !RESEARCH_VERSION_INDEX && "HUMANDBS_ES_INDEX_RESEARCH_VERSION",
    !DATASET_INDEX && "HUMANDBS_ES_INDEX_DATASET",
  ].filter(Boolean)
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`)
    process.exit(1)
  }
  // Safety guard 1: target must end with `-it` so a misconfigured run can't drop production.
  for (const idx of [RESEARCH_INDEX, RESEARCH_VERSION_INDEX, DATASET_INDEX]) {
    if (!/-it$/.test(idx)) {
      console.error(
        `Refusing to bootstrap: index "${idx}" must end with "-it" (production safety guard).`,
      )
      process.exit(1)
    }
  }
}

/** Strip the `-it` suffix to derive the source production index name. */
const productionName = (itIndex: string): string => itIndex.replace(/-it$/, "")

const dropIndex = async (client: Client, indexName: string): Promise<void> => {
  const exists = await client.indices.exists({ index: indexName })
  if (exists) {
    console.log(`Deleting existing index ${indexName}`)
    await client.indices.delete({ index: indexName })
  }
}

const createWithMapping = async (
  client: Client,
  indexName: string,
  mapping: EsMapping | Record<string, unknown>,
): Promise<void> => {
  console.log(`Creating index ${indexName}`)
  // Pin `refresh_interval: "1s"` on the `-it` index so mutating IT helpers
  // (e.g. setOwnerUids) that read back immediately after a write don't
  // become flaky if the cluster default is changed or if a production-tuned
  // refresh interval is copied via --from-production.
  const body: Record<string, unknown> = { ...mapping }
  const existingSettings = (body.settings ?? {}) as Record<string, unknown>
  body.settings = { ...existingSettings, refresh_interval: "1s" }
  await client.indices.create({
    index: indexName,
    body,
  })
}

interface MinimalSeedDoc {
  index: string
  id: string
  doc: Record<string, unknown>
}

const readFixture = (relPath: string): Record<string, unknown> => {
  const buf = readFileSync(join(FIXTURE_DIR, relPath), "utf8")
  return JSON.parse(buf) as Record<string, unknown>
}

/**
 * Minimum seed: hum0001 (published) + hum0001-v1 + JGAD000002-v1.
 *
 * Each mutating IT creates / cleans up additional state inside its own test
 * body (draft / review / deleted variants etc.) so that tests stay order-
 * independent. The bootstrap only provides the baseline that's expected to
 * exist on every run.
 */
const minimalSeedDocs = (): MinimalSeedDoc[] => {
  const research = readFixture("research/hum0001.json")
  // Production fixtures predate the `status` / `uids` / `draftVersion` fields.
  // Backfill defaults so the document round-trips through `EsResearchSchema`.
  const researchWithDefaults = {
    status: "published",
    uids: [],
    draftVersion: null,
    ...research,
  }

  const dataset = readFixture("dataset/JGAD000002-v1.json")
  type DataValue = { ja?: { text?: string } | null; en?: { text?: string } | null } | null
  const experiments = dataset.experiments as Array<Record<string, unknown>> | undefined
  if (experiments) {
    for (const exp of experiments) {
      exp.dataText = extractDataText(exp.data as Record<string, DataValue>)
    }
  }

  return [
    {
      index: RESEARCH_INDEX,
      id: "hum0001",
      doc: researchWithDefaults,
    },
    {
      index: RESEARCH_VERSION_INDEX,
      id: "hum0001-v1",
      doc: readFixture("research-version/hum0001-v1.json"),
    },
    {
      index: DATASET_INDEX,
      id: "JGAD000002-v1",
      doc: dataset,
    },
  ]
}

/**
 * Pull the live mapping + settings from the production source index. We
 * intentionally use the cluster's live mapping (not `*-schema.ts`) so the
 * isolation index tracks ES reality even if the code-side mapping has drifted.
 *
 * Only `analysis` settings are forwarded (replicas / shards / soft-deletes
 * etc. can be cluster-defined defaults on the isolation index).
 */
const liveIndexBody = async (
  client: Client,
  sourceIndex: string,
): Promise<Record<string, unknown>> => {
  const [mappingRes, settingsRes] = await Promise.all([
    client.indices.getMapping({ index: sourceIndex }),
    client.indices.getSettings({ index: sourceIndex }),
  ])
  const mappingPayload = (mappingRes as unknown as Record<string, { mappings?: unknown }>)[sourceIndex]
  const settingsPayload = (settingsRes as unknown as Record<string, { settings?: { index?: { analysis?: unknown } } }>)[sourceIndex]
  const body: Record<string, unknown> = {
    mappings: mappingPayload?.mappings ?? {},
  }
  const analysis = settingsPayload?.settings?.index?.analysis
  if (analysis) {
    body.settings = { analysis }
  }
  return body
}

const reindexCopy = async (
  client: Client,
  sourceIndex: string,
  targetIndex: string,
): Promise<void> => {
  console.log(`Reindexing ${sourceIndex} → ${targetIndex} (this may take a moment)`)
  const res = await client.reindex({
    body: {
      source: { index: sourceIndex },
      dest: { index: targetIndex, version_type: "internal" },
    },
    wait_for_completion: true,
    refresh: true,
  })
  const failures = (res as unknown as { failures?: unknown[] }).failures ?? []
  if (failures.length > 0) {
    console.error(`_reindex returned failures: ${JSON.stringify(failures).slice(0, 1000)}`)
    process.exit(1)
  }
  const total = (res as unknown as { total?: number }).total ?? 0
  console.log(`  reindexed ${total} doc(s) into ${targetIndex}`)
}

const verifyDocCounts = async (
  client: Client,
  pairs: { source: string; target: string }[],
): Promise<void> => {
  for (const { source, target } of pairs) {
    const [sourceCount, targetCount] = await Promise.all([
      client.count({ index: source }),
      client.count({ index: target }),
    ])
    const s = (sourceCount as unknown as { count?: number }).count ?? -1
    const t = (targetCount as unknown as { count?: number }).count ?? -1
    if (s !== t) {
      console.error(
        `Doc count mismatch: ${source}=${s} vs ${target}=${t}. _reindex may have dropped documents — refusing to declare success.`,
      )
      process.exit(1)
    }
    console.log(`  ${source} == ${target}: ${t} doc(s)`)
  }
}

const main = async (): Promise<void> => {
  validateEnv()

  const targets = [RESEARCH_INDEX, RESEARCH_VERSION_INDEX, DATASET_INDEX]
  const sources = targets.map(productionName)

  // Safety guard 2: source production indices must NOT carry the `-it` suffix,
  // otherwise a misconfigured invocation could reindex an `-it` index into itself.
  for (const src of sources) {
    if (/-it$/.test(src) || !src) {
      console.error(
        `Refusing to bootstrap: derived source index "${src}" must not end with "-it" (loopback safety guard).`,
      )
      process.exit(1)
    }
  }

  console.log(`ES_NODE: ${ES_NODE}`)
  console.log(`Mode: ${FROM_PRODUCTION ? "--from-production (live _reindex)" : "minimal seed"}`)
  console.log(`Targets: ${targets.join(" / ")}`)
  if (FROM_PRODUCTION) {
    console.log(`Sources: ${sources.join(" / ")}`)
  }

  const client = new Client({
    node: ES_NODE,
    Connection: HttpConnection,
  })

  if (FROM_PRODUCTION) {
    for (const idx of targets) {
      await dropIndex(client, idx)
    }
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const source = sources[i]
      const sourceExists = await client.indices.exists({ index: source })
      if (!sourceExists) {
        console.error(
          `Source production index "${source}" does not exist on this cluster. Aborting (cannot reindex from missing source).`,
        )
        process.exit(1)
      }
      const body = await liveIndexBody(client, source)
      await createWithMapping(client, target, body)
    }
    for (let i = 0; i < targets.length; i++) {
      await reindexCopy(client, sources[i], targets[i])
    }
    await verifyDocCounts(
      client,
      targets.map((t, i) => ({ source: sources[i], target: t })),
    )
    console.log("Bootstrap (--from-production) complete.")
    process.exit(0)
  }

  await dropIndex(client, RESEARCH_INDEX)
  await createWithMapping(client, RESEARCH_INDEX, researchMapping)
  await dropIndex(client, RESEARCH_VERSION_INDEX)
  await createWithMapping(client, RESEARCH_VERSION_INDEX, researchVersionMapping)
  await dropIndex(client, DATASET_INDEX)
  await createWithMapping(client, DATASET_INDEX, datasetMapping)

  for (const { index, id, doc } of minimalSeedDocs()) {
    console.log(`Seeding ${index}/${id}`)
    await client.index({
      index,
      id,
      body: doc,
      refresh: "wait_for",
    })
  }

  console.log("Bootstrap (minimal seed) complete.")
  process.exit(0)
}

main().catch((err) => {
  console.error("Bootstrap failed:", err)
  process.exit(1)
})
