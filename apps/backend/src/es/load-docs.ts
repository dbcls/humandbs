import { Client, HttpConnection } from "@elastic/elasticsearch"
import { readFileSync } from "fs"
import { join } from "path"

import type { DatasetDoc, Research, ResearchDoc, ResearchVersionDoc } from "@/types"

// === utils ===
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

// === main ===

const main = async () => {
  const jsonFile = join(__dirname, "../../crawler-results/es-json/research.json")
  const researchData: Research[] = JSON.parse(readFileSync(jsonFile, "utf-8"))

  const researchDocs: ResearchDoc[] = []
  const researchVersionDocs: ResearchVersionDoc[] = []
  const datasetDocs: DatasetDoc[] = []

  for (const r of researchData) {
    const versionIds = r.versions.map((v) => idResearchVersion(r.humId, v.version, v.lang))
    researchDocs.push({
      ...r,
      versions: versionIds,
    })

    for (const rv of r.versions) {
      const dsIds = rv.datasets.map((d) => idDataset(d.datasetId, d.version, d.lang))
      researchVersionDocs.push({
        ...rv,
        datasets: dsIds,
      })

      for (const d of rv.datasets) {
        datasetDocs.push(d)
      }
    }
  }

  const client = new Client({
    node: ES_NODE,
    Connection: HttpConnection,
  })

  for (const idx of Object.values(INDEX)) {
    const exists = await client.indices.exists({ index: idx })
    if (!exists) {
      console.log(`Index ${idx} does not exist`)
      continue
    }
  }

  const bulkIndex = async <T>(index: keyof typeof INDEX, docs: T[], genId: (doc: T) => string) => {
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
      console.error(`Bulk errors: ${INDEX[index]}`, errors)
    } else {
      console.log(`Indexed ${docs.length} -> ${INDEX[index]}`)
    }
  }

  await bulkIndex("research", researchDocs, (d: ResearchDoc) => idResearch(d.humId, d.lang))
  await bulkIndex("researchVersion", researchVersionDocs, (d: ResearchVersionDoc) => idResearchVersion(d.humId, d.version, d.lang))
  await bulkIndex("dataset", datasetDocs, (d) => idDataset(d.datasetId, d.version, d.lang))
}

if (require.main === module) {
  await main()
}
