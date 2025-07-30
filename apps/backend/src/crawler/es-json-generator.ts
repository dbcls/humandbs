import { match } from "assert"
import fs, { existsSync, fstat, mkdirSync, writeFileSync } from "fs"
import { JSDOM } from "jsdom"
import { join } from "path"
import { pid } from "process"

import { loadDetailJson } from "@/crawler/detail-json-dump"
import type { MolecularData } from "@/crawler/detail-parser"
import { humIdToTitle } from "@/crawler/home-parser"
import jgaStudyToDatasetMap from "@/crawler/jga-study-dataset-relation.json"
import type { LangType, Research, Dataset, ResearchVersion, Person, ResearchProject, Grant } from "@/crawler/types"
import { findLatestVersionNum, getResultsDirPath } from "@/crawler/utils"

const ACCESSION_KEYS = [
  "DDBJ Accession",
  "Gene Expression Omnibus Accession",
  "Genomic Expression Archive Accession",
  "Japanese Genotype-phenotype Archive Dataset Accession",
  // "JPOST Accession",
  "MetaboBank Accession",
  "NBDC Dataset Accession",
  "Sequence Read Archive Accession",
  "Dataset ID of the Processed data by JGA",
]

const REGEX_MAP = {
  jgaDataset: /^JGAD\d{5,6}$/,
  jgaStudy: /^JGAS\d{6}$/,
  dra: /^DRA\d{6}$/,
  hum: /^hum\d{4}\.v\d+\.[a-zA-Z0-9_-]+\.[v]\d+$/,
  humAlt: /^hum\d{4}\.v\d+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[v]\d+$/,
  gea: /^E-GEAD-\d{3,4}$/,
  mtbk: /^MTBKS\d{3}$/,
  bioproject: /^PRJDB\d{5}$/,
}

const extractAccessionIdFromStr = (text: string | null): string[] => {
  if (!text) {
    return []
  }
  const tokens = text
    .split(/[\s\u00A0:：()（）,, 、．/／]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)

  const matched = []

  for (let token of tokens) {
    if (token === "hum0009v1.CpG.v1") {
      token = "hum0009.v1.CpG.v1" // hum0009 の例外
    }
    if (token === "AP023461-AP024084") {
      token = "PRJDB10452"
    }

    const isMatch = Object.values(REGEX_MAP).some(regex => regex.test(token))
    if (isMatch) {
      const jgaDatasetMatch = token.match(/^JGAD(\d{5,6})$/)
      if (jgaDatasetMatch) {
        const num = jgaDatasetMatch[1].padStart(6, "0")
        matched.push(`JGAD${num}`)
      } else {
        matched.push(token)
      }
    } else {
      if (token.includes("hum")) {
        // e.g., "hum0042.v1", "hum0076.v1", "hum0354.v1",
        matched.push(token)
      } else if (token.includes("JGA")) {
        if (token === "JGAS0000314") {
          matched.push("JGAS000314")
        } else if (token === "JGAS000239への追加") {
          matched.push("JGAS000239")
        } else if (token === "JGAS000296追加") {
          matched.push("JGAS000296")
        } else if (token === "JGA000122") {
          matched.push("JGAS000122")
        } else if (token === "JGAS000000") {
          matched.push("JGAS000000") // hum0082
        } else {
          console.warn(`Unmatched JGA token: ${token}`)
        }
      } else {
        // tmp.add(token)
      }
    }
  }

  return matched
}

const extractAccessionId = (htmlContent: string | null): string[] => {
  if (!htmlContent) {
    return []
  }
  const dom = new JSDOM(htmlContent)
  const document = dom.window.document

  const allText = document.body.textContent?.trim() ?? ""
  return extractAccessionIdFromStr(allText)
}

// const tmp = new Set<string>()

const jgaStudyToDataset = (id: string): string[] => {
  if (id.startsWith("JGAS")) {
    if (id in jgaStudyToDatasetMap) {
      return jgaStudyToDatasetMap[id]
    }
    return []
  }
  return [id]
}

// type DatasetWithoutVersion = Omit<Dataset, "version">

export const generateEsJson = async (humIds: string[], useCache = true): Promise<void> => {
  const esJsonsDir = join(getResultsDirPath(), "es-json")
  if (!existsSync(esJsonsDir)) {
    mkdirSync(esJsonsDir, { recursive: true })
  }

  // === Dataset ===
  const datasetMap: Record<string, Dataset[]> = {} // key: datasetId-lang, value: Dataset[]
  const humIdVersionToDatasetIdMap: Record<string, string[]> = {} // key: humId-lang-versionNum, value: datasetId[]

  for (const humId of humIds) {
    const latestVersionNum = await findLatestVersionNum(humId, useCache)
    const langs: LangType[] = ["ja", "en"]
    for (const lang of langs) {
      const datasetMapPerHumIdLang: Record<string, Dataset[]> = {} // key: datasetId
      for (let versionNum = 1; versionNum <= latestVersionNum; versionNum++) {
        // Types における Dataset を作成する
        // humId 内で同一 datasetId が存在する場合、latest を優先する
        // humId を超える Dataset があるのか確認する
        const humVersionId = `${humId}-v${versionNum}`
        const jsonData = loadDetailJson(humVersionId, lang, useCache)

        // 最上部の Dataset Table の情報 (release date など) 後で参照する
        const datasetMetadata: Record<string, any> = {}
        for (const dataset of jsonData.datasets) {
          const dataIds = dataset.dataId.flatMap(id => extractAccessionIdFromStr(id)).flatMap(jgaStudyToDataset)
          for (const dataId of dataIds) {
            if (dataId in datasetMetadata) {
              // console.warn(`Duplicate datasetId found: ${dataId} in ${humVersionId} ${lang}`)
              continue
            }
            datasetMetadata[dataId] = {
              typeOfData: dataset.typeOfData,
              criteria: dataset.criteria,
              releaseDate: dataset.releaseDate,
              touched: false,
            }
          }
        }

        const datasetMapPerVersion: Record<string, Dataset> = {}
        for (const molData of jsonData.molecularData) {
          // table 単位で考える。
          const molDataIds = new Set<string>()
          // table の中の id を取得
          for (const key of ACCESSION_KEYS) {
            if (key in molData.data) {
              const ids = extractAccessionId(molData.data[key])
              ids.flatMap(jgaStudyToDataset).forEach(id => molDataIds.add(id))
            }
          }
          if (molDataIds.size === 0) {
            if (molData.id === "JGAD000006の集計情報です。") {
              molData.id = "hum0009v1.CpG.v1"
              molDataIds.add("hum0009v1.CpG.v1") // hum0009
            } else if (molData.id === "hum0009v1.CpG.v1") {
              molDataIds.add("hum0009v1.CpG.v1") // hum0009
            } else if (molData.id === "JGAS000143") {
              molDataIds.add("JGAS000143")
            } else if (molData.id === "AP023461-AP024084") {
              molDataIds.add("PRJDB10452")
            } else {
              console.warn(`No accession IDs found in ${humId} version ${versionNum} for molecular data: ${molData.id}`)
            }
          }

          // header の中の id を取得
          const headerIds = extractAccessionIdFromStr(molData.id)
          headerIds.flatMap(jgaStudyToDataset).forEach(id => molDataIds.add(id))

          for (const molDataId of molDataIds) {
            if (molDataId in datasetMapPerVersion) {
              // Experiment の追加
              datasetMapPerVersion[molDataId].experiments.push({
                header: molData.id,
                data: molData.data,
                footers: molData.footers,
              })
            } else {
              // 新規の Dataset を作成
              if (molDataId in datasetMetadata) {
                datasetMetadata[molDataId].touched = true
              }
              datasetMapPerVersion[molDataId] = {
                datasetId: molDataId,
                lang,
                version: 1,
                typeOfData: datasetMetadata?.[molDataId]?.typeOfData ?? null,
                criteria: datasetMetadata?.[molDataId]?.criteria ?? null,
                releaseDate: datasetMetadata?.[molDataId]?.releaseDate ?? null,
                experiments: [{
                  header: molData.id,
                  data: molData.data,
                  footers: molData.footers,
                }],
              }
            }
          }
        }
        // for (const [dataId, metadata] of Object.entries(datasetMetadata)) {
        //   if (!metadata.touched) {
        //     console.log(`No molecular data found for ${dataId} in ${humId} version ${versionNum} ${lang}`)
        //   }
        // }

        // version処理の終わり
        // datasetMapPerHumIdLang に追加
        humIdVersionToDatasetIdMap[`${humId}-${lang}-v${versionNum}`] = []
        for (const [datasetId, dataset] of Object.entries(datasetMapPerVersion)) {
          const key = `${datasetId}-${lang}`
          if (key in datasetMapPerHumIdLang) {
            const prevDataset = datasetMapPerHumIdLang[key][datasetMapPerHumIdLang[key].length - 1]
            if (JSON.stringify(prevDataset.experiments) !== JSON.stringify(dataset.experiments)) {
              // 新しい Dataset がある場合、追加
              dataset.version = prevDataset.version + 1
              datasetMapPerHumIdLang[key].push(dataset)
              humIdVersionToDatasetIdMap[`${humId}-${lang}-v${versionNum}`].push(`${key}-${dataset.version}`)
            }
          } else {
            datasetMapPerHumIdLang[key] = [dataset]
            humIdVersionToDatasetIdMap[`${humId}-${lang}-v${versionNum}`].push(`${key}-1`)
          }
        }
      }

      // hum lang 処理の終わり
      // datasetMap に追加
      // 衝突を確認する
      for (const [datasetIdLang, datasets] of Object.entries(datasetMapPerHumIdLang)) {
        if (datasetIdLang in datasetMap) {
          console.warn(`Duplicate datasetIdLang found: ${datasetIdLang} in ${humId} ${lang}`)
          // console.log(JSON.stringify(datasetMap[datasetIdLang], null, 2))
        } else {
          datasetMap[datasetIdLang] = datasets
        }
      }
    }
  }

  const titleMapJa = await humIdToTitle("ja", useCache)
  const titleMapEn = await humIdToTitle("en", useCache)

  const researches: Research[] = []

  for (const humId of humIds) {
    const latestVersionNum = await findLatestVersionNum(humId, useCache)
    const langs: LangType[] = ["ja", "en"]
    for (const lang of langs) {

      const latestJsonData = loadDetailJson(`${humId}-v${latestVersionNum}`, lang, useCache)
      const dataProvider: Person[] = []
      for (let i = 0; i < latestJsonData.dataProvider.principalInvestigator.length; i++) {
        dataProvider.push({
          name: latestJsonData.dataProvider.principalInvestigator[i],
          organization: {
            name: latestJsonData.dataProvider.affiliation[i],
          },
        })
      }
      const researchProject: ResearchProject[] = []
      for (let i = 0; i < latestJsonData.dataProvider.projectName.length; i++) {
        researchProject.push({
          name: latestJsonData.dataProvider.projectName[i],
          url: latestJsonData.dataProvider.projectUrl[i],
        })
      }
      const grant: Grant[] = []
      for (const parsedGrants of latestJsonData.dataProvider.grants) {
        for (let i = 0; i < parsedGrants.grantId.length; i++) {
          grant.push({
            id: parsedGrants.grantId[i],
            title: parsedGrants.grantName[i],
            agency: {
              name: parsedGrants.projectTitle[i],
            },
          })
        }
      }

      const research: Research = {
        humId,
        lang,
        title: lang === "ja" ? titleMapJa[humId] : titleMapEn[humId],
        url: lang === "ja" ?
          `https://humandbs.dbcls.jp/${humId}` :
          `https://humandbs.dbcls.jp/en/${humId}`,
        dataProvider,
        researchProject,
        grant,
        relatedPublication: latestJsonData.publications.map(pub => ({
          title: pub.title,
          authors: [],
          consortiums: [],
          status: "published",
          year: 2000,
          datasetIds: pub.datasetIds,
        })),
        controlledAccessUser: latestJsonData.controlledAccessUsers.map(user => ({
          name: user.principalInvestigator ?? "TODO: Name",
          organization: {
            name: user.affiliation ?? "TODO: Organization Name",
            address: {
              country: user.country,
            },
          },
          datasetIds: user.datasetIds,
          researchTitle: user.researchTitle,
          periodOfDataUse: user.periodOfDataUse,
        })),
        summary: {
          aims: latestJsonData.summary.aims,
          methods: latestJsonData.summary.methods,
          targets: latestJsonData.summary.targets,
          url: latestJsonData.summary.url,
        },
        versions: [],
      }

      for (let versionNum = 1; versionNum <= latestVersionNum; versionNum++) {
        // Types における Dataset を作成する
        // humId 内で同一 datasetId が存在する場合、latest を優先する
        // humId を超える Dataset があるのか確認する
        const humVersionId = `${humId}-v${versionNum}`
        const jsonData = loadDetailJson(humVersionId, lang, useCache)
        const datasetIds = humIdVersionToDatasetIdMap[`${humId}-${lang}-v${versionNum}`] ?? [] // [`${datasetId}-${lang}-${dataset.version}`]
        const datasets: Dataset[] = []
        for (const datasetIdLangVersion of datasetIds) {
          const [datasetId, datasetLang, version] = datasetIdLangVersion.split("-")
          const datasetArray = datasetMap[`${datasetId}-${datasetLang}`] ?? []
          for (const datasetItem of datasetArray) {
            if (datasetItem.version.toString() === version) {
              datasets.push(datasetItem)
            }
          }
        }
        const releaseDate = jsonData.releases?.filter(r => r.humVersionId === humVersionId)[0]?.releaseDate ?? "2000-01-01"
        const releaseNote = jsonData.releases?.filter(r => r.humVersionId === humVersionId)[0]?.releaseNote ?? []
        const researchVersion: ResearchVersion = {
          humId,
          lang,
          version: `v${versionNum}`,
          humVersionId,
          datasets,
          releaseDate,
          releaseNote,
        }
        research.versions.push(researchVersion)
      }

      researches.push(research)
    }
  }

  // === Write JSON files ===
  const researchJsonFilePath = join(esJsonsDir, "research.json")
  const researchJsonData = JSON.stringify(researches, null, 2)
  writeFileSync(researchJsonFilePath, researchJsonData, "utf8")
}
