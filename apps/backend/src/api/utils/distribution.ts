import * as nodeFs from "node:fs"
import { join } from "node:path"

import { CACHE_TTL } from "@/api/constants"
import {
  DblinkAccessionType,
  fetchDblinkTargets,
} from "@/api/external/ddbj-search/dblink"
import { logger } from "@/api/logger"
import type { DistributionItem } from "@/api/types"

const DRA_BASE = "https://ddbj.nig.ac.jp/public/ddbj_database/dra"
const GEA_BASE = "https://ddbj.nig.ac.jp/public/ddbj_database/gea"
const METABOBANK_BASE = "https://ddbj.nig.ac.jp/public/metabobank"

const FILES_PATH = process.env.HUMANDBS_FILES_PATH ?? ""

// --- TTL Map Cache ---

interface CacheEntry<T> {
  value: T
  expiry: number
}

class TtlMapCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>()
  private readonly ttl: number

  constructor(ttl: number) {
    this.ttl = ttl
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiry) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, expiry: Date.now() + this.ttl })
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

const distributionCache = new TtlMapCache<DistributionItem[]>(CACHE_TTL.DISTRIBUTION)

const GEA_RE = /^E-GEAD-(\d+)$/
const METABOBANK_RE = /^MTBKS\d+$/
const DRA_RE = /^DRA\d{6}$/
const NBDC_DATASET_RE = /^hum\d{4,6}\./

function buildGeaDistribution(datasetId: string): DistributionItem[] {
  const match = GEA_RE.exec(datasetId)
  if (!match) return []
  const num = parseInt(match[1], 10)
  const groupPrefix = `E-GEAD-${String(Math.floor(num / 1000) * 1000).padStart(3, "0")}`
  return [{
    url: `${GEA_BASE}/experiment/${groupPrefix}/${datasetId}/`,
    name: `${datasetId} data dir`,
    type: "directory",
  }]
}

function buildMetaboBankDistribution(datasetId: string): DistributionItem[] {
  return [{
    url: `${METABOBANK_BASE}/study/${datasetId}/`,
    name: `${datasetId} data dir`,
    type: "directory",
  }]
}

async function buildDraDistribution(
  submission: string,
): Promise<DistributionItem[]> {
  // submission → study → experiment の順で辿る
  // (dblink グラフに submission → experiment の直接リンクがないため)
  const studies = await fetchDblinkTargets(
    DblinkAccessionType.SRA_SUBMISSION,
    submission,
    DblinkAccessionType.SRA_STUDY,
  )
  if (studies.length === 0) return []

  const experimentSets = await Promise.all(
    studies.map((study) =>
      fetchDblinkTargets(
        DblinkAccessionType.SRA_STUDY,
        study,
        DblinkAccessionType.SRA_EXPERIMENT,
      ),
    ),
  )
  const experiments = [...new Set(experimentSets.flat())]
  if (experiments.length === 0) return []

  const subPrefix = submission.slice(0, 6)
  const items: DistributionItem[] = []

  const runsByExp = await Promise.all(
    experiments.map(async (exp) => ({
      experiment: exp,
      runs: await fetchDblinkTargets(
        DblinkAccessionType.SRA_EXPERIMENT,
        exp,
        DblinkAccessionType.SRA_RUN,
      ),
    })),
  )

  for (const { experiment, runs } of runsByExp) {
    items.push({
      url: `${DRA_BASE}/fastq/${subPrefix}/${submission}/${experiment}/`,
      name: `${experiment} fastq dir`,
      type: "directory",
    })

    const expPrefix = experiment.slice(0, 6)
    for (const run of runs) {
      items.push({
        url: `${DRA_BASE}/sra/ByExp/sra/DRX/${expPrefix}/${experiment}/${run}/${run}.sra`,
        name: `${run}.sra`,
        type: "file",
      })
    }
  }

  return items
}

async function buildNbdcDistribution(
  datasetId: string,
  humId: string,
): Promise<DistributionItem[]> {
  if (!FILES_PATH) return []

  const dirPath = join(FILES_PATH, humId)
  let entries: string[]
  try {
    entries = await nodeFs.promises.readdir(dirPath)
  } catch {
    return []
  }

  return entries
    .filter((name) => name.startsWith(`${datasetId}.`) || name.startsWith(`${datasetId}_`))
    .sort()
    .map((name) => ({
      url: `/files/${humId}/${name}`,
      name,
      type: "file" as const,
    }))
}

type DatasetIdKind = "gea" | "metabobank" | "dra" | "nbdc-dataset" | "unknown"

function detectKind(datasetId: string): DatasetIdKind {
  if (GEA_RE.test(datasetId)) return "gea"
  if (METABOBANK_RE.test(datasetId)) return "metabobank"
  if (DRA_RE.test(datasetId)) return "dra"
  if (NBDC_DATASET_RE.test(datasetId)) return "nbdc-dataset"
  return "unknown"
}

export async function getDistribution(
  datasetId: string,
  humId: string,
): Promise<DistributionItem[]> {
  const cached = distributionCache.get(datasetId)
  if (cached) return cached

  const kind = detectKind(datasetId)
  let result: DistributionItem[]
  switch (kind) {
    case "gea":
      result = buildGeaDistribution(datasetId)
      break
    case "metabobank":
      result = buildMetaboBankDistribution(datasetId)
      break
    case "dra":
      result = await buildDraDistribution(datasetId)
      break
    case "nbdc-dataset":
      result = await buildNbdcDistribution(datasetId, humId)
      break
    case "unknown":
      result = []
      break
  }

  distributionCache.set(datasetId, result)
  return result
}

export async function getDistributionSafe(
  datasetId: string,
  humId: string,
): Promise<DistributionItem[]> {
  try {
    return await getDistribution(datasetId, humId)
  } catch (err) {
    logger.warn("Failed to build distribution links", {
      datasetId,
      humId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

export {
  TtlMapCache,
  detectKind,
  buildGeaDistribution,
  buildMetaboBankDistribution,
  distributionCache,
}
