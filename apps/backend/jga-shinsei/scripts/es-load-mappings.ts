/**
 * JGA Shinsei - ES マッピング作成スクリプト
 *
 * `jga-shinsei-ds` / `jga-shinsei-du` インデックスを作成する。
 * 既存インデックスはスキップ。
 *
 * Usage: bun run jga-shinsei:load-mappings
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"

import type { EsMapping } from "../../src/es/generate-mapping"
import { dsMapping } from "./es-ds-schema"
import { duMapping } from "./es-du-schema"

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "elasticsearch"
const ES_PORT = process.env.HUMANDBS_ES_PORT ?? "9200"
const ES_NODE = `http://${ES_HOST}:${ES_PORT}`

const INDICES: Record<string, EsMapping> = {
  "jga-shinsei-ds": dsMapping,
  "jga-shinsei-du": duMapping,
}

const main = async () => {
  console.log("Loading JGA Shinsei ES mappings...")
  console.log(`ES_NODE: ${ES_NODE}`)

  const client = new Client({
    node: ES_NODE,
    Connection: HttpConnection,
  })

  for (const [indexName, mapping] of Object.entries(INDICES)) {
    try {
      const exists = await client.indices.exists({ index: indexName })
      if (exists) {
        console.log(`Index ${indexName} already exists, skipping`)
        continue
      }

      const response = await client.indices.create({
        index: indexName,
        body: mapping,
      })

      if (response.acknowledged) {
        console.log(`Index ${indexName} created successfully`)
      } else {
        console.error(`Failed to create index ${indexName}`)
      }
    } catch (error) {
      console.error(`Error creating index ${indexName}:`, error)
    }
  }

  console.log("\nDone!")
}

if (import.meta.main) {
  await main()
}
