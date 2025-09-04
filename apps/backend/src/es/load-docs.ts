import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync } from "fs"
import { join } from "path"

import { type Research, type Dataset, type ResearchVersion } from "@/crawler/types"

const INDEXES = [
  "research",
  "research-version",
  "dataset",
]

type ResearchDoc = Omit<Research, "versions"> & {
  versions: string[]
}
type ResearchVersionDoc = Omit<ResearchVersion, "datasets"> & {
  datasets: string[]
}

const main = async () => {
  const researches: ResearchDoc[] = []
  const researchVersions: ResearchVersionDoc[] = []
  const datasets: Dataset[] = []

  const jsonFile = join(__dirname, "../../crawler-results/es-json/research.json")
  const jsonData: Research[] = JSON.parse(readFileSync(jsonFile, "utf-8"))
  for (const research of jsonData) {
    const researchDoc: ResearchDoc = {
      ...research,
      versions: research.versions.map((version) => `${version.humVersionId}-${version.lang}`),
    }
    researches.push(researchDoc)

    for (const researchVersion of research.versions) {
      const researchVersionDoc = {
        ...researchVersion,
        datasets: researchVersion.datasets.map((dataset) => `${dataset.datasetId}-${dataset.version}-${dataset.lang}`),
      }
      researchVersions.push(researchVersionDoc)

      for (const datasetDoc of researchVersion.datasets) {
        const dataset = {
          ...datasetDoc,
          humDatasetId: `${datasetDoc.datasetId}-${datasetDoc.version}-${datasetDoc.lang}`,
        }
        datasets.push(dataset)
      }
    }
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

  const genId = (index: "research" | "research-version" | "dataset", doc: ResearchDoc | ResearchVersionDoc | Dataset) => {
    switch (index) {
      case "research":
        return `${doc.humId}-${doc.lang}`
      case "research-version":
        return `${doc.humId}-${doc.version}-${doc.lang}`
      case "dataset":
        return `${doc.datasetId}-${doc.version}-${doc.lang}`
      default:
        throw new Error(`Unknown document type: ${index}`)
    }
  }

  const bulkIndex = async (index: string, documents: any[]) => {
    try {
      const operations = documents.flatMap(doc => [
        { index: { _index: index, _id: genId(index, doc) } },
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

  await bulkIndex("research", researches)
  await bulkIndex("research-version", researchVersions)
  await bulkIndex("dataset", datasets)
}

if (require.main === module) {
  await main()
}
