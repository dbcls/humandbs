/**
 * Bootstrap isolated Elasticsearch indices for mutating integration tests.
 *
 * Creates fresh `research-it` / `research-version-it` / `dataset-it` indices
 * with production mappings and seeds the minimum fixture set so the mutating
 * IT suite can write without touching production data.
 *
 * Required env vars (all must end with `-it` — refuses to clobber production):
 *   HUMANDBS_ES_INDEX_RESEARCH
 *   HUMANDBS_ES_INDEX_RESEARCH_VERSION
 *   HUMANDBS_ES_INDEX_DATASET
 *
 * Usage (from inside the backend container):
 *   HUMANDBS_ES_INDEX_RESEARCH=research-it \
 *   HUMANDBS_ES_INDEX_RESEARCH_VERSION=research-version-it \
 *   HUMANDBS_ES_INDEX_DATASET=dataset-it \
 *   bun run scripts/bootstrap-it-index.ts
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync } from "fs"
import { join } from "path"

import { datasetMapping } from "@/es/dataset-schema"
import type { EsMapping } from "@/es/generate-mapping"
import { researchMapping } from "@/es/research-schema"
import { researchVersionMapping } from "@/es/research-version-schema"

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "elasticsearch"
const ES_PORT = process.env.HUMANDBS_ES_PORT ?? "9200"
const ES_NODE = `http://${ES_HOST}:${ES_PORT}`

const RESEARCH_INDEX = process.env.HUMANDBS_ES_INDEX_RESEARCH ?? ""
const RESEARCH_VERSION_INDEX = process.env.HUMANDBS_ES_INDEX_RESEARCH_VERSION ?? ""
const DATASET_INDEX = process.env.HUMANDBS_ES_INDEX_DATASET ?? ""

const FIXTURE_DIR = join(import.meta.dir, "..", "tests", "fixtures", "es")

const validateEnv = (): void => {
  const missing = [
    !RESEARCH_INDEX && "HUMANDBS_ES_INDEX_RESEARCH",
    !RESEARCH_VERSION_INDEX && "HUMANDBS_ES_INDEX_RESEARCH_VERSION",
    !DATASET_INDEX && "HUMANDBS_ES_INDEX_DATASET",
  ].filter(Boolean)
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`)
    process.exit(1)
  }
  // Safety guard: refuse anything that doesn't carry the `-it` marker so a
  // misconfigured run can't drop the production indices.
  for (const idx of [RESEARCH_INDEX, RESEARCH_VERSION_INDEX, DATASET_INDEX]) {
    if (!/-it$/.test(idx)) {
      console.error(
        `Refusing to bootstrap: index "${idx}" must end with "-it" (production safety guard).`,
      )
      process.exit(1)
    }
  }
}

const recreateIndex = async (
  client: Client,
  indexName: string,
  mapping: EsMapping,
): Promise<void> => {
  const exists = await client.indices.exists({ index: indexName })
  if (exists) {
    console.log(`Deleting existing index ${indexName}`)
    await client.indices.delete({ index: indexName })
  }
  console.log(`Creating index ${indexName}`)
  await client.indices.create({
    index: indexName,
    body: mapping,
  })
}

interface SeedDoc {
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
const seedDocs = (): SeedDoc[] => {
  const research = readFixture("research/hum0001.json")
  // Production fixtures predate the `status` / `uids` / `draftVersion` fields.
  // Backfill defaults so the document round-trips through `EsResearchSchema`.
  const researchWithDefaults = {
    status: "published",
    uids: [],
    draftVersion: null,
    ...research,
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
      doc: readFixture("dataset/JGAD000002-v1.json"),
    },
  ]
}

const main = async (): Promise<void> => {
  validateEnv()

  console.log(`ES_NODE: ${ES_NODE}`)
  console.log(`Indices: ${RESEARCH_INDEX} / ${RESEARCH_VERSION_INDEX} / ${DATASET_INDEX}`)

  const client = new Client({
    node: ES_NODE,
    Connection: HttpConnection,
  })

  await recreateIndex(client, RESEARCH_INDEX, researchMapping)
  await recreateIndex(client, RESEARCH_VERSION_INDEX, researchVersionMapping)
  await recreateIndex(client, DATASET_INDEX, datasetMapping)

  for (const { index, id, doc } of seedDocs()) {
    console.log(`Seeding ${index}/${id}`)
    await client.index({
      index,
      id,
      body: doc,
      refresh: "wait_for",
    })
  }

  console.log("Bootstrap complete.")
  process.exit(0)
}

main().catch((err) => {
  console.error("Bootstrap failed:", err)
  process.exit(1)
})
