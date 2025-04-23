import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"

import { loadDetailJson } from "@/crawler/detail-json-dump"
import type { LangType } from "@/crawler/types"
import { findLatestVersionNum, getResultsDirPath } from "@/crawler/utils"

export const dumpSummaryJson = async (humIds: string[], useCache = true): Promise<void> => {
  const summaryJsonDir = join(getResultsDirPath(), "summary-json")
  if (!existsSync(summaryJsonDir)) {
    mkdirSync(summaryJsonDir, { recursive: true })
  }

  const summarizedValue: Record<LangType, Record<string, any>> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    ja: {},
    en: {},
  }

  const pushValue = (lang: LangType, humVersionId: string, key: string, value: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (summarizedValue[lang][key] === undefined) summarizedValue[lang][key] = []
    if (value === null) return
    if (Array.isArray(value)) {
      value.forEach((v: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (v === null) return
        summarizedValue[lang][key].push({ humVersionId, value: v })
      })
    } else {
      summarizedValue[lang][key].push({ humVersionId, value })
    }
  }

  for (const humId of humIds) {
    const latestVersionNum = await findLatestVersionNum(humId, useCache)
    let langs: LangType[] = ["ja", "en"]
    if (["hum0003"].includes(humId)) {
      langs = ["ja"]
    }

    for (let versionNum = 1; versionNum <= latestVersionNum; versionNum++) {
      const humVersionId = `${humId}-v${versionNum}`
      for (const lang of langs) {
        const jsonData = loadDetailJson(humVersionId, lang, useCache)
        // SUMMARY
        pushValue(lang, humVersionId, "summary-aims", jsonData.summary.aims)
        pushValue(lang, humVersionId, "summary-methods", jsonData.summary.methods)
        pushValue(lang, humVersionId, "summary-targets", jsonData.summary.targets)
        pushValue(lang, humVersionId, "summary-url", jsonData.summary.url)

        // Dataset
        pushValue(lang, humVersionId, "dataset-dataId", jsonData.datasets.flatMap(dataset => dataset.dataId.flatMap(dataId => dataId)))
        pushValue(lang, humVersionId, "dataset-typeOfData", jsonData.datasets.flatMap(dataset => dataset.typeOfData.flatMap(typeOfData => typeOfData)))
        pushValue(lang, humVersionId, "dataset-criteria", jsonData.datasets.flatMap(dataset => dataset.criteria.flatMap(criteria => criteria)))
        pushValue(lang, humVersionId, "dataset-releaseDate", jsonData.datasets.flatMap(dataset => dataset.releaseDate.flatMap(releaseDate => releaseDate)),
        )

        // MOLECULAR DATA
        pushValue(lang, humVersionId, "moldata-keys", jsonData.molecularData.flatMap(molData => Object.keys(molData.data)))
        pushValue(lang, humVersionId, "moldata-targets-values", jsonData.molecularData.flatMap(molData =>
          Object.entries(molData.data)
            .filter(([key]) => key === "Targets" || key === "規模")
            .flatMap(([, value]) => value as string[]),
        ).map(value => {
          if (typeof value === "object" && value !== null && "text" in value) {
            return (value as { text: string }).text
          } else {
            return value
          }
        }))
        pushValue(lang, humVersionId, "moldata-ids", jsonData.molecularData.flatMap(molData => molData.ids))
        pushValue(lang, humVersionId, "moldata-footers", jsonData.molecularData.flatMap(molData => molData.footers))

        // DATA PROVIDER
        pushValue(lang, humVersionId, "datapro-pi", jsonData.dataProvider.principalInvestigator)
        pushValue(lang, humVersionId, "datapro-affiliation", jsonData.dataProvider.affiliation)
        pushValue(lang, humVersionId, "datapro-projectName", jsonData.dataProvider.projectName)
        pushValue(lang, humVersionId, "datapro-projectUrl", jsonData.dataProvider.projectUrl)
        pushValue(lang, humVersionId, "datapro-grant-grantName", jsonData.dataProvider.grants.flatMap(grant => grant.grantName))
        pushValue(lang, humVersionId, "datapro-grant-grantId", jsonData.dataProvider.grants.flatMap(grant => grant.grantId))
        pushValue(lang, humVersionId, "datapro-grant-projectTitle", jsonData.dataProvider.grants.flatMap(grant => grant.projectTitle))

        // PUBLICATION
        pushValue(lang, humVersionId, "publication-title", jsonData.publications.flatMap(pub => pub.title))
        pushValue(lang, humVersionId, "publication-doi", jsonData.publications.flatMap(pub => pub.doi))
        pushValue(lang, humVersionId, "publication-datasetIds", jsonData.publications.flatMap(pub => pub.datasetIds))

        // CONTROLLED ACCESS USERS
        pushValue(lang, humVersionId, "ca-users-pi", jsonData.controlledAccessUsers.flatMap(caUser => caUser.principalInvestigator))
        pushValue(lang, humVersionId, "ca-users-affiliation", jsonData.controlledAccessUsers.flatMap(caUser => caUser.affiliation))
        pushValue(lang, humVersionId, "ca-users-country", jsonData.controlledAccessUsers.flatMap(caUser => caUser.country))
        pushValue(lang, humVersionId, "ca-users-datasetIds", jsonData.controlledAccessUsers.flatMap(caUser => caUser.datasetIds))
        pushValue(lang, humVersionId, "ca-users-periodOfDataUse", jsonData.controlledAccessUsers.flatMap(caUser => caUser.periodOfDataUse))
      }
    }
  }

  for (const lang of ["ja", "en"] as LangType[]) {
    for (const [key, value] of Object.entries(summarizedValue[lang])) {
      const summaryFilePath = join(summaryJsonDir, `${key}-${lang}.json`)
      const sortedAndUniqueValues = [...new Set(value.map((v: any) => v.value))].sort() // eslint-disable-line @typescript-eslint/no-explicit-any
      writeFileSync(summaryFilePath, JSON.stringify(sortedAndUniqueValues, null, 2))

      if (value.length !== 0) {
        if (typeof value[0].value === "object") {
          const insideKeys = Object.keys(value[0].value)
          for (const insideKey of insideKeys) {
            const summaryFilePathWithInsideKey = join(summaryJsonDir, `${key}-${lang}-${insideKey}.json`)
            const sortedAndUniqueValuesInsideKey = [...new Set(value.map((v: any) => v.value[insideKey]))].sort() // eslint-disable-line @typescript-eslint/no-explicit-any
            writeFileSync(summaryFilePathWithInsideKey, JSON.stringify(sortedAndUniqueValuesInsideKey, null, 2))
          }
        }
      }

      const summaryFilePathWithHumIds = join(summaryJsonDir, `${key}-${lang}-with-humIds.json`)
      writeFileSync(summaryFilePathWithHumIds, JSON.stringify(value, null, 2))
    }
  }

  // Dump for mol data targets and keys
  // moldata-keys
  for (const lang of ["ja", "en"] as LangType[]) {
    const molDataKeysRows: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
    const items = summarizedValue[lang]["moldata-keys"]
    for (const item of items) {
      if (molDataKeysRows[item.value] === undefined) {
        molDataKeysRows[item.value] = [item.value, "", [item.humVersionId]]
      } else {
        molDataKeysRows[item.value][2].push(item.humVersionId)
      }
    }
    const moldataKeysFilePath = join(summaryJsonDir, `moldata-keys-${lang}.tsv`)
    writeFileSync(moldataKeysFilePath, Object.values(molDataKeysRows).map(row => row.join("\t")).join("\n"))
  }

  // moldata-targets-values
  const header = ["実際の値", "正規化された値", "humVersionIds"]
  for (const key of ["dataset-typeOfData", "moldata-targets-values", "moldata-keys"]) {
    for (const lang of ["ja", "en"] as LangType[]) {
      const molDataKeysRows: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
      const items = summarizedValue[lang][key]
      for (const item of items) {
        if (molDataKeysRows[item.value] === undefined) {
          molDataKeysRows[item.value] = [item.value, "", [item.humVersionId]]
        } else {
          molDataKeysRows[item.value][2].push(item.humVersionId)
        }
      }
      const moldataTargetsFilePath = join(summaryJsonDir, `${key}-${lang}.tsv`)
      writeFileSync(moldataTargetsFilePath, [header, ...Object.values(molDataKeysRows)].map(row => row.join("\t")).join("\n"))
    }
  }

}
