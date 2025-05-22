import fs from "fs"
import path from "path"

import type { ParseResult } from "./detail-parser"
import type { LangType } from "./types"

const loadHeaderTable = (): string => {
  const tsvPath = path.join(__dirname, "header.tsv")
  const content = fs.readFileSync(tsvPath, "utf-8")
  return content
}

const content = loadHeaderTable()
const lines = content.split("\n").slice(1).map((line) => line.split("\t"))

const SPLIT_CELL = "Japanese Genotype-phenotype Archive Dataset AccessionとSequence Read Archive Accessionに分ける"
const SPLIT_VAL_1 = "Japanese Genotype-phenotype Archive Dataset Accession"
const SPLIT_VAL_2 = "Sequence Read Archive Accession"
const UNUSED_CELL = "不要な項目のため削除する"
const jaMap = new Map<string, string>()
const enMap = new Map<string, string>()
const jaToEnMap = new Map<string, string>()
const splitSet = new Set<string>()
const unUsedSet = new Set<string>()

for (const line of lines) {
  const ja = line[0]
  const en = line[1]
  const fixedJa = line[2]
  const fixedEn = line[3]
  if (fixedJa === SPLIT_CELL) {
    splitSet.add(ja)
    splitSet.add(en)
    continue
  }
  if (fixedJa === UNUSED_CELL) {
    unUsedSet.add(ja)
    unUsedSet.add(en)
    continue
  }
  jaMap.set(ja, fixedJa)
  enMap.set(en, fixedEn)
  jaToEnMap.set(fixedJa, fixedEn)
}

export const normalizeMolDataHeader = (humVersionId: string, lang: LangType, parseResult: ParseResult) => {
  const headerMap = lang === "ja" ? jaMap : enMap
  for (const molData of parseResult.molecularData) {
    const newData: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(molData.data)) {
      if (unUsedSet.has(key)) {
        if (value) {
          // console.warn(`Unused header ${key} has value ${value}, in ${humVersionId}`)
        }
        continue
      }
      if (splitSet.has(key)) {
        newData[SPLIT_VAL_1] = value
        newData[SPLIT_VAL_2] = value
        continue
      }
      const fixedKey = key.split("\n").join(" ")
      let newKey = headerMap.get(fixedKey)
      if (lang === "ja") {
        newKey = jaToEnMap.get(newKey ?? "")
      }
      if (newKey) {
        newData[newKey] = value
      } else {
        newData[fixedKey] = value
        console.warn(`Header ${fixedKey} not found in header table, in ${humVersionId}`)
      }
    }
    molData.data = newData
  }
}
