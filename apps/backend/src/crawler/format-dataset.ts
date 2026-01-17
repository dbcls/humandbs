import fs from "fs"
import { join } from "path"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { parseAllHumIds } from "@/crawler/home"
import { findLatestVersionNum, getResultsDirPath, headLatestVersionNum, readNormalizedDetailJson } from "@/crawler/io"
import type { LangType, CrawlArgs, NormalizedParseResult } from "@/crawler/types"

type IdType = "SRA" | "JGAD" | "JGAS" | "GEA" | "NBDC_DATASET" | "BP" | "METABO"

const SRA_REGEX = /(DRA|ERA|SRP|SRR|SRX|SRS)\d{6}/g
const JGAD_REGEX = /JGAD\d{6}/g
const JGAS_REGEX = /JGAS\d{6}/g
const GEA_REGEX = /E-GEAD-\d{3,4}/g
const NBDC_DATASET_REGEX = /hum\d{4}\.v\d+(?:\.[A-Za-z0-9_-]+)*\.v\d+/g
const BP_REGEX = /PRJDB\d{5}/g
const METABO_REGEX = /MTBKS\d{3}/g

const ID_FIELDS = [
  "Dataset ID of the Processed data by JGA",
  "Genomic Expression Archive Accession",
  "Japanese Genotype-phenotype Archive Dataset Accession",
  "MetaboBank Accession",
  "NBDC Dataset Accession",
  "Sequence Read Archive Accession",
]

const ID_PATTERNS: Record<IdType, RegExp> = {
  SRA: SRA_REGEX,
  JGAD: JGAD_REGEX,
  JGAS: JGAS_REGEX,
  GEA: GEA_REGEX,
  NBDC_DATASET: NBDC_DATASET_REGEX,
  BP: BP_REGEX,
  METABO: METABO_REGEX,
}

const extractIdsByType = (text: string): Partial<Record<IdType, string[]>> => {
  const result: Partial<Record<IdType, string[]>> = {}

  for (const [type, regex] of Object.entries(ID_PATTERNS) as [IdType, RegExp][]) {
    const matches = text.match(regex)
    if (matches && matches.length > 0) {
      result[type] = matches
    }
  }

  return result
}

interface DbXref {
  identifier: string
  type: string
  url: string
}

interface JgaStudyDoc {
  found: boolean
  _source: {
    dbXrefs?: DbXref[]
  }
}

export async function studyToDatasets(
  studyId: string,
): Promise<string[]> {
  const url = `https://ddbj.nig.ac.jp/search/resources/jga-study/_doc/${studyId}`

  const res = await fetch(url)
  if (!res.ok) return []

  const json = (await res.json()) as JgaStudyDoc
  if (!json.found) return []

  return (json._source.dbXrefs ?? [])
    .filter(x => x.type === "jga-dataset")
    .map(x => x.identifier)
}

interface JgaDatasetDoc {
  found: boolean
  _source: {
    dbXrefs?: DbXref[]
  }
}

export async function datasetToStudy(
  datasetId: string,
): Promise<string[]> {
  const url = `https://ddbj.nig.ac.jp/search/resources/jga-dataset/_doc/${datasetId}`

  const res = await fetch(url)
  if (!res.ok) return []

  const json = (await res.json()) as JgaDatasetDoc
  if (!json.found) return []

  return (json._source.dbXrefs ?? [])
    .filter(x => x.type === "jga-study")
    .map(x => x.identifier)
}

// JGAS -> JGAD[]
const studyToDatasetCache = new Map<string, string[]>()

// JGAD -> JGAS[]
const datasetToStudyCache = new Map<string, string[]>()

const getDatasetsFromStudy = async (studyId: string): Promise<string[]> => {
  if (studyToDatasetCache.has(studyId)) {
    return studyToDatasetCache.get(studyId)!
  }

  const datasets = await studyToDatasets(studyId)
  studyToDatasetCache.set(studyId, datasets)
  return datasets
}

const getStudiesFromDataset = async (datasetId: string): Promise<string[]> => {
  if (datasetToStudyCache.has(datasetId)) {
    return datasetToStudyCache.get(datasetId)!
  }

  const studies = await datasetToStudy(datasetId)
  datasetToStudyCache.set(datasetId, studies)
  return studies
}

const formatOneDetail = async (
  humVersionId: string,
  lang: LangType,
): Promise<Record<IdType, Set<string>>> => {
  const detail = readNormalizedDetailJson(humVersionId, lang) as NormalizedParseResult | null
  if (!detail) {
    throw new Error(`Detail JSON not found for ${humVersionId} (${lang})`)
  }

  const idSets: Record<IdType, Set<string>> = {
    SRA: new Set(),
    JGAD: new Set(),
    JGAS: new Set(),
    GEA: new Set(),
    NBDC_DATASET: new Set(),
    BP: new Set(),
    METABO: new Set(),
  }

  const addIds = (text: string) => {
    const found = extractIdsByType(text)
    for (const [type, ids] of Object.entries(found) as [IdType, string[]][]) {
      for (const id of ids) {
        if (id === "E-GEAD-000" || id === "E-GEAD-1000") continue
        idSets[type].add(id)
      }
    }
  }

  for (const md of detail.molecularData) {
    if (md.id?.text) {
      // hot fix
      if (md.id.text === "AP023461-AP024084") {
        idSets.BP.add("PRJDB10452")
      }
      addIds(md.id.text)
    }

    for (const key of ID_FIELDS) {
      const val = md.data[key]
      if (!val) continue

      const values = Array.isArray(val) ? val : [val]
      for (const v of values) {
        addIds(v.text)
        addIds(v.rawHtml)
      }
    }
  }

  /* ========= complement ========= */
  // JGAS -> JGAD
  for (const jgas of [...idSets.JGAS]) {
    const jgads = await getDatasetsFromStudy(jgas)
    for (const jgad of jgads) {
      idSets.JGAD.add(jgad)
    }
  }

  // JGAD -> JGAS
  for (const jgad of [...idSets.JGAD]) {
    const jgass = await getStudiesFromDataset(jgad)
    for (const jgas of jgass) {
      idSets.JGAS.add(jgas)
    }
  }

  return idSets
}

const dumpStudyDatasetCache = () => {
  const obj = Object.fromEntries(
    [...studyToDatasetCache.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  )

  fs.writeFileSync(
    join(getResultsDirPath(), "jgas_to_jgad.json"),
    JSON.stringify(obj, null, 2),
    "utf8",
  )
}

const parseArgs = (): CrawlArgs =>
  yargs(hideBin(process.argv))
    .option("hum-id", { alias: "i", type: "string" })
    .option("lang", { choices: ["ja", "en"] as const })
    .option("concurrency", { type: "number", default: 4 })
    .parseSync()

const main = async (): Promise<void> => {
  const args = parseArgs()
  const useCache = !args.noCache
  // const langs: LangType[] = args.lang ? [args.lang] : ["ja", "en"]
  const langs: LangType[] = args.lang ? [args.lang] : ["ja"]
  const humIds = args.humId ? [args.humId] : await parseAllHumIds(useCache)

  const tasks: (() => Promise<void>)[] = []
  const results = new Map<string, Record<IdType, Set<string>>>()

  for (const humId of humIds) {
    const latest = await findLatestVersionNum(humId, useCache).catch(() =>
      headLatestVersionNum(humId),
    )

    // for (let v = 1; v <= latest; v++) {
    const v = latest
    const humVersionId = `${humId}-v${v}`

    for (const lang of langs) {
      if (humVersionId === "hum0003-v1" && lang === "en") continue

      tasks.push(async () => {
        try {
          const idSets = await formatOneDetail(humVersionId, lang)
          results.set(humVersionId, idSets)
        } catch (e) {
          console.error(
            `Failed to format detail for ${humVersionId} (${lang}): ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      })
    }
    // }
  }

  const conc = Math.max(1, Math.min(32, args.concurrency ?? 4))
  for (let i = 0; i < tasks.length; i += conc) {
    await Promise.all(tasks.slice(i, i + conc).map(fn => fn()))
  }

  dumpStudyDatasetCache()

  // dump
  const outObj: Record<string, Record<IdType, string[]>> = {}
  for (const [humVersionId, idSets] of results.entries()) {
    outObj[humVersionId] = {} as Record<IdType, string[]>
    for (const [type, idSet] of Object.entries(idSets) as [IdType, Set<string>][]) {
      outObj[humVersionId][type] = [...idSet].sort((a, b) => a.localeCompare(b))
    }
  }

  fs.writeFileSync(
    join(getResultsDirPath(), "formatted-dataset-ids.json"),
    JSON.stringify(outObj, null, 2),
    "utf8",
  )
}

if (require.main === module) {
  await main()
}
