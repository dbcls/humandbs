/**
 * Load documents from structured-json directory into Elasticsearch
 *
 * Reads JSON files from:
 * - crawler-results/structured-json/research/
 * - crawler-results/structured-json/research-version/
 * - crawler-results/structured-json/dataset/
 *
 * Document IDs (bilingual - no lang suffix):
 * - research: {humId}
 * - research-version: {humId}-{version}
 * - dataset: {datasetId}-{version}
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"
import { existsSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"

// === Types ===

interface DatasetDoc {
  datasetId: string
  version: string
  [key: string]: unknown
}

interface ResearchDoc {
  humId: string
  status?: string
  uids?: string[]
  [key: string]: unknown
}

interface ResearchVersionDoc {
  humId: string
  version: string
  [key: string]: unknown
}

// === Constants ===

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "elasticsearch"
const ES_PORT = process.env.HUMANDBS_ES_PORT ?? "9200"
const ES_NODE = `http://${ES_HOST}:${ES_PORT}`

const INDEX = {
  research: "research",
  researchVersion: "research-version",
  dataset: "dataset",
} as const

// === Utils ===

/**
 * Normalize version string to v{number} format
 */
const normVersion = (v: string | number): string => {
  if (typeof v === "number") return `v${v}`
  const s = v.trim()
  if (/^v\d+/.test(s)) return s
  if (/^\d+/.test(s)) return `v${s}`
  throw new Error(`Invalid version format: ${v}`)
}

/**
 * Document ID generators (without lang suffix)
 */
const idResearch = (humId: string): string => humId
const idResearchVersion = (humId: string, version: string): string =>
  `${humId}-${normVersion(version)}`
const idDataset = (datasetId: string, version: string): string =>
  `${datasetId}-${normVersion(version)}`

/**
 * Transform research document for ES indexing
 * - Add default status and uids if not present
 */
const transformResearch = (doc: ResearchDoc): ResearchDoc => ({
  ...doc,
  status: doc.status ?? "published",
  uids: doc.uids ?? [],
})

/**
 * Find crawler-results directory by searching up from current file
 */
function findResultsDir(): string {
  let currentDir = dirname(__filename)
  while (!existsSync(join(currentDir, "package.json"))) {
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error("Failed to find package.json")
    }
    currentDir = parentDir
  }
  return join(currentDir, "crawler-results")
}

/**
 * Get the source directory for a given type
 */
function getSourceDir(type: "research" | "research-version" | "dataset"): string {
  const resultsDir = findResultsDir()
  const structuredDir = join(resultsDir, "structured-json", type)

  if (existsSync(structuredDir)) {
    return structuredDir
  }

  throw new Error(`structured-json/${type} directory not found`)
}

/**
 * Read all JSON files from a directory
 */
function readJsonFilesFromDir<T>(dir: string): T[] {
  if (!existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`)
    return []
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  return files.map((f) => {
    const content = readFileSync(join(dir, f), "utf8")
    return JSON.parse(content) as T
  })
}

// === Main ===

const main = async () => {
  console.log("Loading documents into Elasticsearch...")
  console.log(`ES_NODE: ${ES_NODE}`)

  // Read from structured-json/
  const researchDir = getSourceDir("research")
  const researchVersionDir = getSourceDir("research-version")
  const datasetDir = getSourceDir("dataset")

  console.log("\nSource directories:")
  console.log(`  Research: ${researchDir}`)
  console.log(`  Research Version: ${researchVersionDir}`)
  console.log(`  Dataset: ${datasetDir}`)

  const researchDocs = readJsonFilesFromDir<ResearchDoc>(researchDir)
  const researchVersionDocs = readJsonFilesFromDir<ResearchVersionDoc>(researchVersionDir)
  const datasetDocs = readJsonFilesFromDir<DatasetDoc>(datasetDir)

  console.log("\nLoaded documents:")
  console.log(`  Research: ${researchDocs.length}`)
  console.log(`  Research Version: ${researchVersionDocs.length}`)
  console.log(`  Dataset: ${datasetDocs.length}`)

  if (
    researchDocs.length === 0 &&
    researchVersionDocs.length === 0 &&
    datasetDocs.length === 0
  ) {
    console.log("\nNo documents to index. Exiting.")
    return
  }

  const client = new Client({
    node: ES_NODE,
    Connection: HttpConnection,
  })

  // Check indices exist
  for (const idx of Object.values(INDEX)) {
    const exists = await client.indices.exists({ index: idx })
    if (!exists) {
      console.warn(
        `\nWarning: Index ${idx} does not exist. Please run es:load-mappings first.`,
      )
    }
  }

  const bulkIndex = async <T>(
    index: keyof typeof INDEX,
    docs: T[],
    genId: (doc: T) => string,
    transform?: (doc: T) => T,
  ) => {
    if (docs.length === 0) return

    const transformedDocs = transform ? docs.map(transform) : docs
    const ops = transformedDocs.flatMap((doc) => [
      { index: { _index: INDEX[index], _id: genId(doc) } },
      doc,
    ])

    const res = await client.bulk({ refresh: true, body: ops })
    if (res.errors) {
      const errors = res.items
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => Object.values(it)[0].error)
        .map(({ it, i }) => ({
          status: Object.values(it)[0].status,
          error: Object.values(it)[0].error,
          op: ops[i * 2],
          doc: ops[i * 2 + 1],
        }))
      console.error(`\nBulk errors for ${INDEX[index]}:`, errors.slice(0, 5))
      if (errors.length > 5) {
        console.error(`  ... and ${errors.length - 5} more errors`)
      }
    } else {
      console.log(`\nIndexed ${docs.length} documents -> ${INDEX[index]}`)
    }
  }

  // Index documents (no lang suffix in IDs)
  await bulkIndex("research", researchDocs, (d) => idResearch(d.humId), transformResearch)
  await bulkIndex("researchVersion", researchVersionDocs, (d) =>
    idResearchVersion(d.humId, d.version),
  )
  await bulkIndex("dataset", datasetDocs, (d) => idDataset(d.datasetId, d.version))

  console.log("\nDone!")
}

if (require.main === module) {
  await main()
}
