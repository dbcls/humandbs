import fs from "fs"
import path from "path"

import type { LangType } from "@/crawler/types"

const HEADER_TSV_PATH = path.join(__dirname, "moldata-mapping-table.tsv")

interface MappingTableRow {
  ja_raw: string
  en_raw: string
  ja_norm: string
  en_norm: string
}

export const loadMolDataMappingTable = (): MappingTableRow[] => {
  const content = fs.readFileSync(HEADER_TSV_PATH, "utf8")
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== "")

  // skip header line
  const dataLines = lines.slice(1)

  const table: MappingTableRow[] = dataLines.map(line => {
    const [ja_raw, en_raw, ja_norm, en_norm] = line.split("\t")
    if (!ja_raw || !en_raw || !ja_norm || !en_norm) {
      throw new Error(`Invalid mapping table line: ${line}`)
    }
    return { ja_raw, en_raw, ja_norm, en_norm }
  })

  return table
}

interface MolDataHeaderMapping {
  jaMap: Map<string, string>
  enMap: Map<string, string>
  normJaToEnMap: Map<string, string>
}

export const buildMolDataHeaderMapping = (): MolDataHeaderMapping => {
  const table = loadMolDataMappingTable()
  const jaMap = new Map<string, string>()
  const enMap = new Map<string, string>()
  const normJaToEnMap = new Map<string, string>()

  for (const row of table) {
    jaMap.set(row.ja_raw, row.ja_norm)
    enMap.set(row.en_raw, row.en_norm)
    normJaToEnMap.set(row.ja_norm, row.en_norm)
  }

  return { jaMap, enMap, normJaToEnMap }
}

export const normalizeMolDataKey = (
  rawKey: string,
  lang: LangType,
  mapping: MolDataHeaderMapping,
): string | null => {
  if (lang === "ja") {
    const normJaKey = mapping.jaMap.get(rawKey)
    if (normJaKey) {
      return mapping.normJaToEnMap.get(normJaKey) || null
    }
    return null
  } else {
    return mapping.enMap.get(rawKey) || null
  }
}
