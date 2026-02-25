/**
 * JGA Shinsei - ES ドキュメントロードスクリプト
 *
 * 変換済み JSON ファイルを Elasticsearch にバルクインデックスする。
 * - json-data/ds-applications-transformed.json → jga-shinsei-ds (ID: jdsId)
 * - json-data/du-applications-transformed.json → jga-shinsei-du (ID: jduId)
 *
 * Usage: bun run jga-shinsei:load-docs
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync } from "node:fs"
import path from "node:path"

// === Types ===

interface DsDoc {
  jdsId: string
  [key: string]: unknown
}

interface DuDoc {
  jduId: string
  [key: string]: unknown
}

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
  console.log("Loading JGA Shinsei documents into Elasticsearch...")
  console.log(`ES_NODE: ${ES_NODE}`)

  const baseDir = path.resolve(import.meta.dir, "..")
  const jsonDataDir = path.join(baseDir, "json-data")

  const dsDocs: DsDoc[] = JSON.parse(
    readFileSync(path.join(jsonDataDir, "ds-applications-transformed.json"), "utf-8"),
  )
  const duDocs: DuDoc[] = JSON.parse(
    readFileSync(path.join(jsonDataDir, "du-applications-transformed.json"), "utf-8"),
  )

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
        `\nWarning: Index ${idx} does not exist. Please run jga-shinsei:load-mappings first.`,
      )
    }
  }

  const bulkIndex = async <T>(
    index: keyof typeof INDEX,
    docs: T[],
    genId: (doc: T) => string,
  ) => {
    if (docs.length === 0) return

    let totalIndexed = 0
    let totalErrors = 0

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE)
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
      console.log(`\nIndexed ${totalIndexed}/${docs.length} documents -> ${INDEX[index]} (${totalErrors} errors)`)
    } else {
      console.log(`\nIndexed ${docs.length} documents -> ${INDEX[index]}`)
    }
  }

  await bulkIndex("ds", dsDocs, (d) => d.jdsId)
  await bulkIndex("du", duDocs, (d) => d.jduId)

  console.log("\nDone!")
}

if (import.meta.main) {
  await main()
}
