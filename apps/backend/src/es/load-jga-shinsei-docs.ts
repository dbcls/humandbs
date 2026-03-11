/**
 * JGA Shinsei - ES ドキュメントロードスクリプト
 *
 * 変換済み JSON ファイルを Elasticsearch にバルクインデックスする。
 * - json-data/ds-applications-transformed.json -> jga-shinsei-ds (ID: jdsId)
 * - json-data/du-applications-transformed.json -> jga-shinsei-du (ID: jduId)
 *
 * Usage: bun run es:load-jga-shinsei-docs [--dir <path>]
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync } from "node:fs"
import path from "node:path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import type { z } from "zod"

import type {
  DsApplicationTransformed,
  DuApplicationTransformed,
} from "@/crawler/types/jga-shinsei"
import {
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
} from "@/crawler/types/jga-shinsei"

// === Constants ===

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "elasticsearch"
const ES_PORT = process.env.HUMANDBS_ES_PORT ?? "9200"
const ES_NODE = `http://${ES_HOST}:${ES_PORT}`

const INDEX = {
  ds: "jga-shinsei-ds",
  du: "jga-shinsei-du",
} as const

const BATCH_SIZE = 100

// === Main ===

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .option("dir", {
      type: "string",
      description: "JSON data directory",
      default: path.resolve(__dirname, "../../jga-shinsei/json-data"),
    })
    .help()
    .argv

  const jsonDataDir = path.resolve(argv.dir)

  console.log("Loading JGA Shinsei documents into Elasticsearch...")
  console.log(`ES_NODE: ${ES_NODE}`)
  console.log(`JSON dir: ${jsonDataDir}`)

  const dsDocs = JSON.parse(
    readFileSync(path.join(jsonDataDir, "ds-applications-transformed.json"), "utf-8"),
  ) as unknown[]
  const duDocs = JSON.parse(
    readFileSync(path.join(jsonDataDir, "du-applications-transformed.json"), "utf-8"),
  ) as unknown[]

  console.log("\nLoaded documents:")
  console.log(`  DS: ${dsDocs.length}`)
  console.log(`  DU: ${duDocs.length}`)

  if (dsDocs.length === 0 && duDocs.length === 0) {
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

  /**
   * Validate raw documents with Zod schema, then bulk-index.
   * Documents that fail validation are logged and skipped.
   */
  const bulkIndex = async <T>(
    index: keyof typeof INDEX,
    rawDocs: unknown[],
    schema: z.ZodType<T>,
    genId: (doc: T) => string,
  ) => {
    if (rawDocs.length === 0) return

    // validate
    const validDocs: T[] = []
    for (let i = 0; i < rawDocs.length; i++) {
      const parsed = schema.safeParse(rawDocs[i])
      if (!parsed.success) {
        console.error(
          `Validation failed for ${INDEX[index]} doc[${i}]:`,
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

  await bulkIndex("ds", dsDocs, DsApplicationTransformedSchema, (d: DsApplicationTransformed) => d.jdsId)
  await bulkIndex("du", duDocs, DuApplicationTransformedSchema, (d: DuApplicationTransformed) => d.jduId)

  console.log("\nDone!")
}

if (require.main === module) {
  await main()
}
