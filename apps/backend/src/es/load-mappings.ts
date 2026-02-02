/**
 * Load Elasticsearch mappings
 *
 * Creates indices with mappings generated from TypeScript schema definitions.
 */
import { Client, HttpConnection } from "@elastic/elasticsearch"

import { datasetMapping } from "./dataset-schema"
import type { EsMapping } from "./generate-mapping"
import { researchMapping } from "./research-schema"
import { researchVersionMapping } from "./research-version-schema"

const ES_NODE = process.env.ES_HOST ?? "http://humandbs-elasticsearch-dev:9200"

const INDICES: Record<string, EsMapping> = {
  research: researchMapping,
  "research-version": researchVersionMapping,
  dataset: datasetMapping,
}

const main = async () => {
  console.log("Loading ES mappings...")
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

if (require.main === module) {
  await main()
}
