import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

const INDEXES = [
  "research",
  "research-version",
  "dataset",
]

const main = async () => {
  const researches = []
  const researchVersions = []
  const datasets = []
  const jsonDir = join(__dirname, "../../crawler-results/es-json")
  const files = readdirSync(jsonDir)
  const jsonFiles = files.filter(file => file.endsWith(".json")).sort()
  for (const file of jsonFiles) {
    const filePath = join(jsonDir, file)
    const jsonData = JSON.parse(readFileSync(filePath, "utf-8"))
    const researchDoc = Object.assign({}, jsonData)
    researchDoc.versions = researchDoc.versions.map((version) => version.humVersionId)
    researches.push(researchDoc)

    const researchVersionDocs = jsonData.versions.map((version) => {
      const researchVersionDoc = Object.assign({}, version)
      researchVersionDoc.datasets = version.datasets.map((dataset) => dataset.humDatasetId)
      return researchVersionDoc
    })
    researchVersions.push(...researchVersionDocs)

    const datasetDocs = jsonData.versions.flatMap((version) => {
      return version.datasets.map((dataset) => {
        const datasetDoc = Object.assign({}, dataset)
        return datasetDoc
      })
    })
    datasets.push(...datasetDocs)
  }

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
      if (!exists) {
        console.log(`Index ${index} does not exist`)
        continue
      }

    } catch (error) {
      console.error(`Error creating index ${index}:`, error)
    }
  }

  const bulkIndex = async (index: string, documents: any[], idField: string) => {
    try {
      const operations = documents.flatMap(doc => [
        { index: { _index: index, _id: `${doc[idField]}-${doc.lang}` } },
        doc,
      ])

      const bulkResponse = await client.bulk({ refresh: true, body: operations })

      if (bulkResponse.errors) {
        const erroredDocuments = []
        bulkResponse.items.forEach((action: any, i: number) => {
          const operation = Object.keys(action)[0]
          if (action[operation].error) {
            erroredDocuments.push({
              status: action[operation].status,
              error: action[operation].error,
              operation: operations[i * 2],
              document: operations[i * 2 + 1],
            })
          }
        })
        console.error(`Errors occurred while indexing documents into ${index}:`, erroredDocuments)
      } else {
        console.log(`Successfully indexed ${documents.length} documents into ${index}`)
      }
    } catch (error) {
      console.error(`Error indexing documents into ${index}:`, error)
    }
  }

  await bulkIndex("research", researches, "humId")
  await bulkIndex("research-version", researchVersions, "humVersionId")
  await bulkIndex("dataset", datasets, "humDatasetId")
}

if (require.main === module) {
  await main()
}
