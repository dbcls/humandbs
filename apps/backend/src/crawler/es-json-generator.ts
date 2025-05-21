import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"

import { loadDetailJson } from "@/crawler/detail-json-dump"
import { humIdToTitle } from "@/crawler/home-parser"
import type { LangType, Research, DatasetVersion, ResearchVersion } from "@/crawler/types"
import { findLatestVersionNum, getResultsDirPath } from "@/crawler/utils"

// import type { ParseResult } from "./detail-parser"

export const generateEsJson = async (humIds: string[], useCache = true): Promise<void> => {
  const esJsonsDir = join(getResultsDirPath(), "es-json")
  if (!existsSync(esJsonsDir)) {
    mkdirSync(esJsonsDir, { recursive: true })
  }

  const titleMapJa = await humIdToTitle("ja", useCache)
  const titleMapEn = await humIdToTitle("en", useCache)

  for (const humId of humIds) {
    if (humId === "hum0003") {
      continue // TODO Check this
    }
    const latestVersionNum = await findLatestVersionNum(humId, useCache)
    const langs: LangType[] = ["ja", "en"]
    for (const lang of langs) {
      const latestJsonData = loadDetailJson(`${humId}-v${latestVersionNum}`, lang, useCache)
      const research: Research = {
        humId,
        title: lang === "ja" ? titleMapJa[humId] : titleMapEn[humId],
        url: lang === "ja" ?
          `https://humandbs.dbcls.jp/${humId}` :
          `https://humandbs.dbcls.jp/en/${humId}`,
        dataProvider: {
          principalInvestigator: latestJsonData.dataProvider.principalInvestigator,
          affiliation: latestJsonData.dataProvider.affiliation,
          researchProjectName: latestJsonData.dataProvider.projectName,
          researchProjectUrl: latestJsonData.dataProvider.projectUrl,
        },
        grant: latestJsonData.dataProvider.grants.flatMap(grant => {
          const length = grant.grantId.length
          return Array.from({ length }, (_, i) => ({
            id: grant.grantId[i],
            title: grant.projectTitle[i],
            agency: grant.grantName[i],
          }))
        }),
        relatedPublication: latestJsonData.publications,
        controlledAccessUser: latestJsonData.controlledAccessUsers.map(user => ({
          name: user.principalInvestigator,
          affiliation: user.affiliation,
          country: user.country,
          researchTitle: user.researchTitle,
          datasetId: user.datasetIds,
          periodOfDataUse: user.periodOfDataUse,
        })),
        version: [],
      }
      const datasetMap = normalizeDataset(humId, lang, latestVersionNum, useCache)
      for (let versionNum = 1; versionNum <= latestVersionNum; versionNum++) {
        const humVersionId = `${humId}-v${versionNum}`
        const jsonData = loadDetailJson(humVersionId, lang, useCache)
        const release = jsonData.releases?.filter(r => r.humVersionId === humVersionId)[0]
        const datasets = Object.values(datasetMap)
          .flatMap(versions => Object.values(versions))
          .filter(d => d.humVersionIds.includes(humVersionId))
        const researchVersion: ResearchVersion = {
          humId,
          version: `v${versionNum}`,
          humVersionId,
          datasets: datasets,
          releaseDate: release?.releaseDate ?? "",
          releaseNote: release?.releaseNote ?? [],
        }
        research.version.push(researchVersion)
      }
    }
  }
}

// interface DatasetVersion {
//   datasetId: string
//   datasetVersion: string
//   humDatasetId: string
//   humVersionIds: string[]
//   data: Record<string, string>
//   footers: string[]
//   typeOfData: string[]
//   criteria: string[]
//   releaseDate: string[]
// }

export const normalizeDataset = (humId: string, lang: LangType, latestVersionNum: number, useCache = true): Record<string, Record<number, DatasetVersion>> => {
  const datasetMap: Record<string, Record<number, DatasetVersion>> = {}
  for (let versionNum = 1; versionNum <= latestVersionNum; versionNum++) {
    const humVersionId = `${humId}-v${versionNum}`
    const jsonData = loadDetailJson(humVersionId, lang, useCache)
    const datasetFieldMap = jsonData.datasets.reduce((acc, d) => {
      d.dataId.forEach(id => {
        if (!(id in acc)) {
          acc[id] = { typeOfData: [], criteria: [], releaseDate: [] }
        }
        acc[id].typeOfData.push(...d.typeOfData)
        acc[id].criteria.push(...d.criteria)
        acc[id].releaseDate.push(...d.releaseDate)
      })
      return acc
    }, {} as Record<string, { typeOfData: string[]; criteria: string[]; releaseDate: string[] }>)
    for (const molData of jsonData.molecularData) {
      for (const datasetId of molData.ids) {
        const nowDataset = {
          data: molData.data,
          footers: molData.footers,
          typeOfData: datasetFieldMap[datasetId]?.typeOfData ?? [], // TODO why?
          criteria: datasetFieldMap[datasetId]?.criteria ?? [], // TODO why?
          releaseDate: datasetFieldMap[datasetId]?.releaseDate ?? [], // TODO why?
        }
        if (datasetId in datasetMap) {
          const latestVersionId = Math.max(...Object.keys(datasetMap[datasetId]).map(Number))
          const latestDataset = datasetMap[datasetId][latestVersionId]
          const { datasetId: _, humDatasetId, datasetVersion, humVersionIds, ...withoutLatestDataset } = latestDataset // eslint-disable-line @typescript-eslint/no-unused-vars
          if (JSON.stringify(withoutLatestDataset) !== JSON.stringify(nowDataset)) {
            datasetMap[datasetId][latestVersionId + 1] = {
              ...nowDataset,
              datasetId,
              humDatasetId: `${humId}-${datasetId}-v${latestVersionId + 1}`,
              datasetVersion: `v${latestVersionId + 1}`,
              humVersionIds: [humVersionId],
            }
          } else {
            datasetMap[datasetId][latestVersionId].humVersionIds.push(humVersionId)
          }
        } else {
          datasetMap[datasetId] = {
            1: {
              ...nowDataset,
              datasetId,
              humDatasetId: `${humId}-${datasetId}-v${versionNum}`,
              datasetVersion: "v1",
              humVersionIds: [humVersionId],
            },
          }
        }
      }
    }
  }

  return datasetMap
}
