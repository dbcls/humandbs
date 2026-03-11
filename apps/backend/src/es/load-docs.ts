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
import type { z } from "zod"

import {
  EsResearchSchema,
  EsDatasetSchema,
  ResearchVersionSchema,
} from "./types"

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
export const normVersion = (v: string | number): string => {
  if (typeof v === "number") return `v${v}`
  const s = v.trim()
  if (/^v\d+/.test(s)) return s
  if (/^\d+/.test(s)) return `v${s}`
  throw new Error(`Invalid version format: ${v}`)
}

/**
 * Document ID generators (without lang suffix)
 */
export const idResearch = (humId: string): string => humId
export const idResearchVersion = (humId: string, version: string): string =>
  `${humId}-${normVersion(version)}`
export const idDataset = (datasetId: string, version: string): string =>
  `${datasetId}-${normVersion(version)}`

/**
 * Transform research document for ES indexing
 * - Add default status and uids if not present
 */
export const transformResearch = (doc: Record<string, unknown>): Record<string, unknown> => ({
  ...doc,
  status: (doc.status as string | undefined) ?? "published",
  uids: (doc.uids as string[] | undefined) ?? [],
})

/**
 * Find crawler-results directory by searching up from current file
 */
export const findResultsDir = (): string => {
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
export const getSourceDir = (type: "research" | "research-version" | "dataset"): string => {
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
export const readJsonFilesFromDir = (dir: string): { fileName: string; data: unknown }[] => {
  if (!existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`)

    return []
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))

  return files.map((f) => {
    const content = readFileSync(join(dir, f), "utf8")

    return { fileName: f, data: JSON.parse(content) as unknown }
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

  const researchRaw = readJsonFilesFromDir(researchDir)
  const researchVersionRaw = readJsonFilesFromDir(researchVersionDir)
  const datasetRaw = readJsonFilesFromDir(datasetDir)

  console.log("\nLoaded files:")
  console.log(`  Research: ${researchRaw.length}`)
  console.log(`  Research Version: ${researchVersionRaw.length}`)
  console.log(`  Dataset: ${datasetRaw.length}`)

  if (
    researchRaw.length === 0 &&
    researchVersionRaw.length === 0 &&
    datasetRaw.length === 0
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

  const BATCH_SIZE = 100

  /**
   * Validate raw documents with optional transform, then bulk-index.
   * Documents that fail Zod validation are logged and skipped.
   */
  const bulkIndex = async <T>(
    index: keyof typeof INDEX,
    rawDocs: { fileName: string; data: unknown }[],
    schema: z.ZodType<T>,
    genId: (doc: T) => string,
    transform?: (doc: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    if (rawDocs.length === 0) return

    // transform → validate
    const validDocs: T[] = []
    for (const { fileName, data } of rawDocs) {
      const transformed = transform
        ? transform(data as Record<string, unknown>)
        : data
      const parsed = schema.safeParse(transformed)
      if (!parsed.success) {
        console.error(
          `Validation failed for ${INDEX[index]}/${fileName}:`,
          parsed.error.issues,
        )
        continue
      }
      validDocs.push(parsed.data)
    }

    if (validDocs.length < rawDocs.length) {
      console.warn(
        `\n${INDEX[index]}: ${rawDocs.length - validDocs.length}/${rawDocs.length} documents skipped due to validation errors`,
      )
    }

    if (validDocs.length === 0) return

    // Split into batches to avoid payload size limits
    let totalIndexed = 0
    let totalErrors = 0

    for (let i = 0; i < validDocs.length; i += BATCH_SIZE) {
      const batch = validDocs.slice(i, i + BATCH_SIZE)
      const ops = batch.flatMap((doc) => [
        { index: { _index: INDEX[index], _id: genId(doc) } },
        doc,
      ])

      const res = await client.bulk({ refresh: false, body: ops })
      if (res.errors) {
        const errors = res.items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) => Object.values(it)[0].error)
          .map(({ it, idx }) => ({
            status: Object.values(it)[0].status,
            error: Object.values(it)[0].error,
            op: ops[idx * 2],
            doc: ops[idx * 2 + 1],
          }))
        totalErrors += errors.length
        if (totalErrors <= 5) {
          console.error(`\nBulk errors for ${INDEX[index]}:`, errors.slice(0, 5 - totalErrors + errors.length))
        }
      }
      totalIndexed += batch.length - (res.errors ? res.items.filter((it) => Object.values(it)[0].error).length : 0)
    }

    // Refresh after all batches
    await client.indices.refresh({ index: INDEX[index] })

    if (totalErrors > 0) {
      console.log(`\nIndexed ${totalIndexed}/${validDocs.length} documents -> ${INDEX[index]} (${totalErrors} errors)`)
    } else {
      console.log(`\nIndexed ${validDocs.length} documents -> ${INDEX[index]}`)
    }
  }

  // Index documents (no lang suffix in IDs)
  await bulkIndex("research", researchRaw, EsResearchSchema, (d) => idResearch(d.humId), transformResearch)
  await bulkIndex("researchVersion", researchVersionRaw, ResearchVersionSchema, (d) =>
    idResearchVersion(d.humId, d.version),
  )
  await bulkIndex("dataset", datasetRaw, EsDatasetSchema, (d) => idDataset(d.datasetId, d.version))

  console.log("\nDone!")
}

if (require.main === module) {
  await main()
}
