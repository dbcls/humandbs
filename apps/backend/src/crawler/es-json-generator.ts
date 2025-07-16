import { existsSync, mkdirSync, writeFileSync } from "fs"
import { JSDOM } from "jsdom"
import { join } from "path"

import { loadDetailJson } from "@/crawler/detail-json-dump"
import type { MolecularData } from "@/crawler/detail-parser"
import { humIdToTitle } from "@/crawler/home-parser"
import type { LangType, Research, Dataset, ResearchVersion } from "@/crawler/types"
import { findLatestVersionNum, getResultsDirPath } from "@/crawler/utils"

const tmp = []

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
        lang,
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
        versions: [],
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
          lang,
          version: `v${versionNum}`,
          humVersionId,
          datasets: datasets,
          releaseDate: release?.releaseDate ?? null,
          releaseNote: release?.releaseNote ?? [],
        }
        research.versions.push(researchVersion)
      }
      // write to file
      const fileName = `research-${humId}-${lang}.json`
      const filePath = join(esJsonsDir, fileName)
      writeFileSync(filePath, JSON.stringify(research, null, 2), { encoding: "utf-8" })
    }
  }
  console.log(Array.from(new Set(tmp)).sort().join("\n"))
}

export const normalizeDataset = (humId: string, lang: LangType, latestVersionNum: number, useCache = true): Record<string, Record<number, Dataset>> => {
  const datasetMap: Record<string, Record<number, Dataset>> = {}
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
    molDataToExperiment(humId, jsonData.molecularData)
    for (const molData of jsonData.molecularData) {
      for (const datasetId of [molData.id]) {
        const nowDataset = {
          data: molData.data,
          lang,
          footers: molData.footers,
          typeOfData: datasetFieldMap[datasetId]?.typeOfData ?? [], // TODO why?
          criteria: datasetFieldMap[datasetId]?.criteria ?? [], // TODO why?
          releaseDate: datasetFieldMap[datasetId]?.releaseDate ?? [], // TODO why?
        }
        if (datasetId in datasetMap) {
          const latestVersionId = Math.max(...Object.keys(datasetMap[datasetId]).map(Number))
          const latestDataset = datasetMap[datasetId][latestVersionId]
          const { datasetId: _, humDatasetId, humVersionIds, experiments, ...withoutLatestDataset } = latestDataset // eslint-disable-line @typescript-eslint/no-unused-vars
          if (JSON.stringify(withoutLatestDataset) !== JSON.stringify(nowDataset)) {
            datasetMap[datasetId][latestVersionId + 1] = {
              ...nowDataset,
              datasetId,
              humDatasetId: `${humId}-${datasetId}-v${latestVersionId + 1}`,
              version: `v${latestVersionId + 1}`,
              humVersionIds: [humVersionId],
              experiments,
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
              version: "v1",
              humVersionIds: [humVersionId],
              experiments: [],
            },
          }
        }
      }
    }
  }

  return datasetMap
}

// - Pattern1: 1 つの ID が 1 つの table
//   - これは簡単
// - Pattern2: 複数の ID で 1 つの table
//   - 冗長に情報を持っていいなら、楽
//   - 冗長と重複の使い分け
// - Pattern3: 1 つの ID で、解析手法ごとに table が作られている
//   - Dataset ID をまとめて、裏返す
// - Pattern4: 解析手法ごとに table が作られている
//   - Pattern2 と 3 の合せ技
//   - value の中に非構造化 (暗黙的に) で書かれている情報のパースは、将来的に考える
//   - とりあえず、情報量は落とさず入れておいて、手でいじる
//
// - 実装方針:
//   - 1 id to table の map をともかく作る
// - footer は、新たに comment (footer) を入れておき value を結合する
// - header の ID っぽいの(label) も残しておくべき
const draRegex = /^DRA\d{6}$/
const draRegexLoose = /DRA\d{6}/
const egaRegex = /^E-GEAD-\d{3}$/
const egaRegexLoose = /E-GEAD-\d{3}/
const jgaRegex = /^JGA[DS]\d{6}$/
const jgaRegexLoose = /JGA[DS]\d{6}/
const humRegex = /^hum\d{4}\.v\d+\.[a-zA-Z0-9_]+\.[v]\d+$/
const humRegexLoose = /hum\d{4}\.v\d+\.[a-zA-Z0-9_]+\.[v]\d+/
const metaboBankRegex = /^MTBKS\d{3}$/
const metaboBankRegexLoose = /MTBKS\d{3}/

const molDataObjToExperimentMap = (molDataObj: MolecularData): Record<string, string> => {
  return {
    ...molDataObj.data,
    "Comment (footer)": molDataObj.footers.join("\n"),
    "Prev Header ID": molDataObj.id,
  }
}

const molDataToExperiment = (humId: string, molData: MolecularData[]): void => {
  const idToTableMap: Record<string, any> = {}
  for (const molDataObj of molData) {
    const id = molDataObj.id
    const experimentMap = molDataObjToExperimentMap(molDataObj)
    if (draRegex.test(id) || egaRegex.test(id) || jgaRegex.test(id) || humRegex.test(id) || metaboBankRegex.test(id)) {
      // 一番きれいなパターン
      idToTableMap[id] = idToTableMap[id] || []
      idToTableMap[id].push(molDataObj.data)
    } else {
      if (id.includes(",") || id.includes("/") || id.includes("、") || id.includes("／")) {
        if (id.includes("DRA") || id.includes("E-GEAD") || id.includes("JGAS") || id.includes("hum") || id.includes("MTBKS")) {
          // 複数の ID がカンマ区切りで入ってそうなやつ
          const ids = id.split(/[,、/]/).map(i => i.trim())
          for (const subId of ids) {
            if (draRegex.test(subId) || egaRegex.test(subId) || jgaRegex.test(subId) || humRegex.test(subId) || metaboBankRegex.test(subId)) {
              // 区切りだがきれいなやつ
              idToTableMap[subId] = idToTableMap[subId] || []
              idToTableMap[subId].push(experimentMap)
            } else {
              // 区切りだがきれいでないやつ
              const looseMatch = subId.match(draRegexLoose) || subId.match(egaRegexLoose) || subId.match(jgaRegexLoose) || subId.match(humRegexLoose) || subId.match(metaboBankRegexLoose)
              if (looseMatch) {
                const looseId = looseMatch[0]
                idToTableMap[looseId] = idToTableMap[looseId] || []
              } else {
                // きれいでないやつの残り => 情報自体は別で拾えている
                // AP023461-AP024084 => AP023461-AP024084 / JGAS000259 TODO: Fix this!!!!!!
                // Exome)*ref3 => JGAS000274 (DNA Amplicon-seq, Exome)*ref3
                // Exome）*ref3 => JGAS000274（DNA Amplicon-seq、Exome）*ref3
                // Visium Spatial Gene Expression => Visium Spatial Gene Expression, Histological image (JGAS000202, JGAS000290), Visium Spatial Gene Expression、病理画像 （JGAS000202、JGAS000290）
                // hum0082.v1.AFFY6.0.v1
                // hum0354.v1.qRT-PCR.v1
                // hum0354.v2.qRT-PCR.v1
                if (subId.startsWith("hum")) {
                  idToTableMap[subId] = idToTableMap[subId] || []
                  idToTableMap[subId].push(experimentMap)
                } else {
                  // 情報は別で拾えている
                }
              }
            }
          }
        } else {
          if ("Japanese Genotype-phenotype Archive Dataset Accession" in molDataObj.data) {
            const jgadHtml = molDataObj.data["Japanese Genotype-phenotype Archive Dataset Accession"]
            const dom = new JSDOM(jgadHtml!)
            const aTags = Array.from(dom.window.document.querySelectorAll("a"))
            const jgadIds = aTags.map(a => a.textContent?.trim() ?? "").filter(id => jgaRegex.test(id))
            if (jgadIds.length !== 0) {
              for (const jgadId of jgadIds) {
                idToTableMap[jgadId] = idToTableMap[jgadId] || []
                idToTableMap[jgadId].push(experimentMap)
              }
            } else {
              // 到達しないはず
              console.warn(`No JGA Dataset ID found in ${humId}: ${molDataObj.id}`)
            }
          } else {
            // eQTL/pQTL study
            // eQTL/pQTL解析
            // eQTL/sQTL study
            // eQTL/sQTL解析
            if ("NBDC Dataset Accession" in molDataObj.data) {
              const nbdcHtml = molDataObj.data["NBDC Dataset Accession"]
              const dom = new JSDOM(nbdcHtml!)
              const aTags = Array.from(dom.window.document.querySelectorAll("a"))
              const nbdcIds = aTags.map(a => a.textContent?.trim() ?? "").filter(id => id.startsWith("hum"))
              if (nbdcIds.length !== 0) {
                for (const nbdcId of nbdcIds) {
                  idToTableMap[nbdcId] = idToTableMap[nbdcId] || []
                  idToTableMap[nbdcId].push(experimentMap)
                }
              } else {
                // 到達しないはず
                console.warn(`No NBDC Dataset ID found in ${humId}: ${molDataObj.id}`)
              }
            } else {
              // 到達しないはず
              console.warn(`No ID found in ${humId}: ${molDataObj.id}`)
            }
          }
        }
      } else {
        // 区切りなし

        // looseMatch で引っかかるヤバそうなデータを先に処理する (TODO: 確認！！)
        const exceptions = {
          "JGAD000006の集計情報です。": "JGAD000006",
          "DRA003802（JGAS000006と同じデータセット内容です。）": "JGAS000006",
          "JGAS000006 （DRA003802[非制限公開]にアクセス制限が変更されました。DRA003802をご参照ください。）": "JGAS000006",
          "DRA003802(Exactly the same data as JGAS000006)": "JGAS000006",
          "JGAS000006 （The access level was changed to \"Unrestricted - access\".Please have a look at DRA003802.)": "JGAS000006",
          "JGAS000159（hum0015.v3.3.5kjpnv2.v1[非制限公開]にアクセス制限が変更されました。hum0015.v3.3.5kjpnv2.v1をご参照ください。）": "hum0015.v3.3.5kjpnv2.v1",
          "hum0015.v3.3.5kjpnv2.v1（JGAS000159と同じデータセット内容です。）": "hum0015.v3.3.5kjpnv2.v1",
          "JGAS000159 （The access level was changed to \"Un-restricted Access\".Please have a look at hum0015.v3.3.5kjpnv2.v1.)": "hum0015.v3.3.5kjpnv2.v1",
          "hum0015.v3.3.5kjpnv2.v1(Exactly the same data as JGAS000159)": "hum0015.v3.3.5kjpnv2.v1",
        }
        if (id in exceptions) {
          const exceptionId = exceptions[id]
          idToTableMap[exceptionId] = idToTableMap[exceptionId] || []
          idToTableMap[exceptionId].push(experimentMap)
          continue
        }

        const looseMatch = id.match(draRegexLoose) || id.match(egaRegexLoose) || id.match(jgaRegexLoose) || id.match(humRegexLoose) || id.match(metaboBankRegexLoose)
        if (looseMatch) {
          if (looseMatch.length !== 1) {
            console.warn(`Multiple loose matches found for ${id}: ${looseMatch.join(", ")}`)
          }
          const looseId = looseMatch[0]
          idToTableMap[looseId] = idToTableMap[looseId] || []
        } else {
          if (id.startsWith("hum")) {
            // hum0009v1.CpG.v1
            // hum0042.v1
            // hum0075.v3.Thai-gwas.v1
            // hum0076.v1
            // hum0126.v2.imp-gwas.v1
            // hum0136.v2.hep-gwas.v1
            // hum0197.v17.hic-gwas.v1
            // hum0197.v21.gwas-ehhv6.v1
            // hum0197.v21.gwas-jomon.v1
            // hum0197.v23.gwas-nmosd.v1
            // hum0197.v9.gwas.GCT.v1
            // hum0354.v1
            // hum0364.v1.wgs-ms.v1
            idToTableMap[id] = idToTableMap[id] || []
            idToTableMap[id].push(experimentMap)
          } else {
            // RNA-seq とか WGS のパターン
            if ("Japanese Genotype-phenotype Archive Dataset Accession" in molDataObj.data) {
              const jgadHtml = molDataObj.data["Japanese Genotype-phenotype Archive Dataset Accession"]
              const dom = new JSDOM(jgadHtml!)
              const aTags = Array.from(dom.window.document.querySelectorAll("a"))
              const jgadIds = aTags.map(a => a.textContent?.trim() ?? "").filter(id => jgaRegex.test(id))
              if (jgadIds.length !== 0) {
                for (const jgadId of jgadIds) {
                  idToTableMap[jgadId] = idToTableMap[jgadId] || []
                  idToTableMap[jgadId].push(experimentMap)
                }
              } else {
                // 到達しないはず
                console.warn(`No JGA Dataset ID found in ${humId}: ${molDataObj.id}`)
              }
            } else {
              // eQTL/pQTL study
              // eQTL/pQTL解析
              // eQTL/sQTL study
              // eQTL/sQTL解析
              if ("NBDC Dataset Accession" in molDataObj.data) {
                const nbdcHtml = molDataObj.data["NBDC Dataset Accession"]
                const dom = new JSDOM(nbdcHtml!)
                const aTags = Array.from(dom.window.document.querySelectorAll("a"))
                const nbdcIds = aTags.map(a => a.textContent?.trim() ?? "").filter(id => id.startsWith("hum"))
                if (nbdcIds.length !== 0) {
                  for (const nbdcId of nbdcIds) {
                    idToTableMap[nbdcId] = idToTableMap[nbdcId] || []
                    idToTableMap[nbdcId].push(experimentMap)
                  }
                } else {
                  // length が 0 のケースが存在する => hum0343 => hum0343.v1.covid19.v1
                  if (humId === "hum0343") {
                    // hum0343.v1.covid19.v1 のケース
                    idToTableMap["hum0343.v1.covid19.v1"] = idToTableMap["hum0343.v1.covid19.v1"] || []
                    idToTableMap["hum0343.v1.covid19.v1"].push(experimentMap)
                  } else {
                    // 到達しないはず
                    console.warn(`No NBDC Dataset ID found in ${humId}: ${molDataObj.id}`)
                  }
                }
              } else {
                if ("Sequence Read Archive Accession" in molDataObj.data) {
                  const draHtml = molDataObj.data["Sequence Read Archive Accession"]
                  const dom = new JSDOM(draHtml!)
                  const aTags = Array.from(dom.window.document.querySelectorAll("a"))
                  const draIds = aTags.map(a => a.textContent?.trim() ?? "").filter(id => draRegex.test(id))
                  if (draIds.length !== 0) {
                    for (const draId of draIds) {
                      idToTableMap[draId] = idToTableMap[draId] || []
                      idToTableMap[draId].push(experimentMap)
                    }
                  } else {
                    // 到達しないはず
                    console.warn(`Multiple DRA IDs found in ${molDataObj.id}: ${draIds.join(", ")}`)
                  }
                } else {
                  // 到達しないはず
                  console.warn(`No ID found in ${humId}: ${molDataObj.id}`)
                }
              }
            }
          }
        }
      }
    }
  }
  tmp.push(...Object.keys(idToTableMap))
}
