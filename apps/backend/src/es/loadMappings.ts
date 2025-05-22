import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync } from "fs"
import { join } from "path"

const INDEXES = [
  "research",
  "research-version",
  "dataset",
]

const main = async () => {
  const client = new Client({
    node: "http://humandbs-elasticsearch-dev:9200",
    // auth: {
    //   username: "elastic",
    //   password: "humandbs-elasticsearch-dev-password",
    // },
    Connection: HttpConnection,
  })
  for (const index of INDEXES) {
    try {
      const exists = await client.indices.exists({ index })
      if (exists) {
        console.log(`Index ${index} already exists`)
        continue
      }
      const mappingsFilePath = join(__dirname, `${index}-mappings.json`)
      const mappings = JSON.parse(readFileSync(mappingsFilePath, "utf-8"))
      if (index === "dataset") {
        const molDataKeysFilePath = join(__dirname, "mol-data-keys.txt")
        const molDataKeys = readFileSync(molDataKeysFilePath, "utf-8").trim().split("\n")
        for (const key of molDataKeys) {
          mappings.mappings.properties.data.properties[key] = {
            "type": "text",
            "fields": {
              "raw": {
                "type": "keyword",
              },
            },
          }
        }
      }
      const response = await client.indices.create({
        index,
        body: mappings,
      })
      if (response.acknowledged) {
        console.log(`Index ${index} created successfully`)
      } else {
        console.error(`Failed to create index ${index}`)
      }
    } catch (error) {
      console.error(`Error creating index ${index}:`, error)
    }
  }
}

if (require.main === module) {
  await main()
}
