/**
 * Load documents from final/ directory into Elasticsearch
 *
 * Reads JSON files from:
 * - crawler-results/final/research/
 * - crawler-results/final/research-version/
 * - crawler-results/final/dataset/
 *
 * Falls back to llm-extracted/ if final/ doesn't exist.
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"
import { existsSync, readdirSync, readFileSync } from "fs"
import { join, dirname } from "path"

// === Utils ===

const ES_NODE = process.env.ES_HOST ?? "http://humandbs-elasticsearch-dev:9200"

const INDEX = {
  research: "research",
  researchVersion: "research-version",
  dataset: "dataset",
} as const

const normVersion = (v: string | number): string => {
  if (typeof v === "number") return `v${v}`
  const s = String(v).trim()
  if (/^v\d+/.test(s)) return s
  if (/^\d+/.test(s)) return `v${s}`
  throw new Error(`Invalid version format: ${v}`)
}

const idResearch = (humId: string, lang: string): string => `${humId}-${lang}`
const idResearchVersion = (humId: string, version: string, lang: string): string => `${humId}-${normVersion(version)}-${lang}`
const idDataset = (datasetId: string, version: string, lang: string): string => `${datasetId}-${normVersion(version)}-${lang}`

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
 * Prefers final/ if it exists, otherwise falls back to llm-extracted/
 */
function getSourceDir(type: "research" | "research-version" | "dataset"): string {
  const resultsDir = findResultsDir()
  const finalDir = join(resultsDir, "final", type)
  const llmDir = join(resultsDir, "llm-extracted", type)

  if (existsSync(finalDir)) {
    return finalDir
  }
  if (existsSync(llmDir)) {
    console.log(`Note: final/${type} not found, using llm-extracted/${type}`)
    return llmDir
  }

  throw new Error(`Neither final/${type} nor llm-extracted/${type} directory found`)
}

/**
 * Read all JSON files from a directory
 */
function readJsonFilesFromDir<T>(dir: string): T[] {
  if (!existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`)
    return []
  }

  const files = readdirSync(dir).filter(f => f.endsWith(".json"))
  return files.map(f => {
    const content = readFileSync(join(dir, f), "utf8")
    return JSON.parse(content) as T
  })
}

// === Document Types ===

interface ResearchDoc {
  humId: string
  lang: string
  [key: string]: unknown
}

interface ResearchVersionDoc {
  humId: string
  version: string
  lang: string
  [key: string]: unknown
}

interface DatasetDoc {
  datasetId: string
  version: string
  lang: string
  [key: string]: unknown
}

// === Main ===

const main = async () => {
  console.log("Loading documents into Elasticsearch...")
  console.log(`ES_NODE: ${ES_NODE}`)

  // Read from final/ (or llm-extracted/ as fallback)
  const researchDir = getSourceDir("research")
  const researchVersionDir = getSourceDir("research-version")
  const datasetDir = getSourceDir("dataset")

  console.log(`\nSource directories:`)
  console.log(`  Research: ${researchDir}`)
  console.log(`  Research Version: ${researchVersionDir}`)
  console.log(`  Dataset: ${datasetDir}`)

  const researchDocs = readJsonFilesFromDir<ResearchDoc>(researchDir)
  const researchVersionDocs = readJsonFilesFromDir<ResearchVersionDoc>(researchVersionDir)
  const datasetDocs = readJsonFilesFromDir<DatasetDoc>(datasetDir)

  console.log(`\nLoaded documents:`)
  console.log(`  Research: ${researchDocs.length}`)
  console.log(`  Research Version: ${researchVersionDocs.length}`)
  console.log(`  Dataset: ${datasetDocs.length}`)

  if (researchDocs.length === 0 && researchVersionDocs.length === 0 && datasetDocs.length === 0) {
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
      console.warn(`\nWarning: Index ${idx} does not exist. Please run es:load-mappings first.`)
    }
  }

  const bulkIndex = async <T>(
    index: keyof typeof INDEX,
    docs: T[],
    genId: (doc: T) => string,
  ) => {
    if (docs.length === 0) return
    const ops = docs.flatMap(doc => [{ index: { _index: INDEX[index], _id: genId(doc) } }, doc])
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

  await bulkIndex("research", researchDocs, (d) => idResearch(d.humId, d.lang))
  await bulkIndex("researchVersion", researchVersionDocs, (d) => idResearchVersion(d.humId, d.version, d.lang))
  await bulkIndex("dataset", datasetDocs, (d) => idDataset(d.datasetId, d.version, d.lang))

  console.log("\nDone!")
}

if (require.main === module) {
  await main()
}
