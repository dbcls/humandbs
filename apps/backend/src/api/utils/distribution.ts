import * as nodeFs from "node:fs"
import { join } from "node:path"

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
    name: datasetId,
    type: "directory",
    encodingFormat: "DATA",
  }]
}

function buildMetaboBankDistribution(datasetId: string): DistributionItem[] {
  return [{
    url: `${METABOBANK_BASE}/study/${datasetId}/`,
    name: datasetId,
    type: "directory",
    encodingFormat: "DATA",
  }]
}

async function buildDraDistribution(
  submission: string,
): Promise<DistributionItem[]> {
  const experiments = await fetchDblinkTargets(
    DblinkAccessionType.SRA_SUBMISSION,
    submission,
    DblinkAccessionType.SRA_EXPERIMENT,
  )
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
      name: experiment,
      type: "directory",
      encodingFormat: "FASTQ",
    })

    const expPrefix = experiment.slice(0, 6)
    for (const run of runs) {
      items.push({
        url: `${DRA_BASE}/sra/ByExp/sra/DRX/${expPrefix}/${experiment}/${run}/${run}.sra`,
        name: `${run}.sra`,
        type: "file",
        encodingFormat: "SRA",
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
  const kind = detectKind(datasetId)
  switch (kind) {
    case "gea":
      return buildGeaDistribution(datasetId)
    case "metabobank":
      return buildMetaboBankDistribution(datasetId)
    case "dra":
      return buildDraDistribution(datasetId)
    case "nbdc-dataset":
      return buildNbdcDistribution(datasetId, humId)
    case "unknown":
      return []
  }
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

export { detectKind, buildGeaDistribution, buildMetaboBankDistribution }
