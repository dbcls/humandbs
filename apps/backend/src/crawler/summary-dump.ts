import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join, normalize } from "path"

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

  const molDataValuesJa = {}
  const molDataValuesEn = {}

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
        // molDataValue
        for (const molData of jsonData.molecularData.flatMap(molData => molData.data)) {
          for (const [key, value] of Object.entries(molData)) {
            if (lang === "ja") {
              if (!(key in molDataValuesJa)) {
                molDataValuesJa[key] = new Set()
              }
              molDataValuesJa[key].add(value)
            } else {
              if (!(key in molDataValuesEn)) {
                molDataValuesEn[key] = new Set()
              }
              molDataValuesEn[key].add(value)
            }
          }
        }

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

  writeFileSync(
    join(summaryJsonDir, "molData-values-ja.tsv"),
    Object.entries(molDataValuesJa)
      .map(([key, values]) => [key, ...Array.from(values).map(v => JSON.stringify(v))].join("\t"))
      .join("\n"),
  )
  writeFileSync(
    join(summaryJsonDir, "molData-values-en.tsv"),
    Object.entries(molDataValuesEn)
      .map(([key, values]) => [key, ...Array.from(values).map(v => JSON.stringify(v))].join("\t"))
      .join("\n"),
  )

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

  const MAPPER = {
    // first
    "マーカー数（raw-call） ※Illumina Final Report形式ファイル": "Marker Numbers (without any filtering) ※Illumina Final Report format files",
    "マーカー数（フィルタ後） ※ped/map形式ファイル": "Marker Numbers (after QC) ※ped/map format files",
    "メチル化アレイ標準化方法": "Normalization of methylation array",
    "対象⋆１": "Participants/Materials⋆１",
    "対象⋆4": "Participants/Materials⋆4",
    "SNVコール": "SNV Call",
    "SNVハプロタイピング": "SNV Haplotyping",
    "２倍体アセンブリ": "diploid assembly",
    "組織": "Organ/Tissue",
    "固定化方法": "Immobilization method",
    "抗原賦活化方法（温度、溶液、PH, 時間）": "Antigen activation method (temperature, reagent, PH, time)",
    "ブロッキング（試薬、時間）": "Blocking method (reagent, time)",
    "免疫染色一次抗体（抗体のメーカー・型番、使用濃度、反応温度・時間）": "Primary antibodies for IHC（manufacturer, Cat. #, conc., temp., time）",
    "免疫染色二次抗体（抗体のメーカー・型番、使用濃度、反応温度・時間）": "Secondary antibodies for IHC（manufacturer, Cat. #, conc., temp., time）",
    "発色（試薬、時間）": "Chromogen (reagent, time)",
    "免染工程における洗浄（試薬、時間）": "Washing (reagent, time)",
    "miRNA数": "miRNA number",
    "遺伝子型/リードカウント決定アルゴリズム（ソフトウェア）": "Genotype Call / Detecting read count Methods (software)",
    "MAGの構築方法": "MAG methods",
    "ウイルスゲノム構築方法": "Virus genome contsruction",
    "CRISPR配列構築方法": "CRISPR contsruction",
    "宿主配列除去やウイルス検出などのためのソフトウェア": "Methods for removing host sequence/detecting viral sequence (software)",
    "フィルタリング（QC）": "Methods for removing host sequence/detecting viral sequence (software)",
    "ウイルス参照配列": "Reference sequence for viral genome",
    "ピーク検出方法": "Detecting Methods for peaks",
    "ループ検出方法": "Detecting Methods for loops",
    "試料調製方法": "Sample Preparation Method",
    "測定条件": "Measurement Conditions",
    "ピーク検出・タンパク同定方法": "Peak Detection / Protein Identification Method",
    "JPOST ID": "JPOST ID",
    "ヒト配列排除方法": "Human Sequence Exclusion Method",
    "HHV-6配列構築方法": "HHV-6 sequence construction method",
    "ゲノム配列構築方法": "Genome Sequence Construction Methods",
    "変異決定方法": "Genome Sequence Construction Methods",
    "一塩基変異数": "Single Nucleotide Variants Number",
    "Mass Submission System ID": "Mass Submission System ID",
    "試薬": "Reagents",
    "パラメータ": "Parameter",
    "検出・定量解析ソフトウェア": "Acquire/analyze data software",
    "実験期間": "Experiment date",
    "実験変数": "Experiment variables",
    "ノイズの低減方法・補正方法": "Noise reduction & Data correction",
    "アノテーション方法": "Annotation",
    "eQTL（trans）検出方法": "Detection method of eQTL (trans)",
    "sQTL検出方法": "Detection method of sQTL",
    "発現量決定方法（ソフトウェア）": "Detecting Methods for Proteins (software)",
    "標準化方法": "Normalization Methods",
    "バリデーション方法": "Validation Methods",
    "pQTL（cis）検出方法": "Detection method of pQTL (cis)",
    "フィルタリング（ノーマライズ、QC方法）": "Filtering Methods (normalization, QC)",
    "リファレンス": "Reference",
    "組織画像": "Tissue Image",
    "オープンクロマチン領域決定アルゴリズム（ソフトウェア）": "Detecting method for open chromatin region (software)",
    "peak数": "Peak Number",
    "測定方法": "Measurement Method",
    "MetaboBank Accession ID": "MetaboBank Accession ID",
    // second
    "対象": "Participants/Materials",
    "規模": "Targets",
    "対象領域（Target Captureの場合）": "Target Loci for Capture Methods",
    "Platform": "Platform",
    "ライブラリソース": "Library Source",
    "ライブラリ作製方法（キット名）": "Library Construction (kit name)",
    "断片化の方法": "Fragmentation Methods",
    "リード長（除：バーコード、アダプター、プライマー、リンカー）": "Read Length (without Barcodes, Adaptors, Primers, and Linkers)",
    "Japanese Genotype-phenotype Archive Dataset ID": "Japanese Genotype-phenotype Archive Dataset ID",
    "総データ量": "Total Data Volume",
    "コメント（利用にあたっての制限事項）": "Comments (Policies)",
    "断片化方法": "Fragmentation Method",
    "DDBJ Sequence Read Archive ID": "DDBJ Sequence Read Archive ID",
    "Japanese Genotype-phenotype Archive Data set ID": "Japanese Genotype-phenotype Archive Data set ID",
    "ソース": "Source",
    "マーカー数（QC後）": "Marker Number (after QC)",
    "マーカー数": "Marker number",
    "NBDC Dataset ID": "NBDC Dataset ID",
    "マーカー数(QC後)": "Marker Number (after QC)",
    "フィルタリング（QC）方法": "QC/Filtering Methods",
    "解析ソフトウェア": "Analysis Software",
    "QC方法": "QC Methods",
    "Imputation方法": "Imputation Methods",
    "SNV数（QC後）": "SNV Numbers (after QC)",
    "Japanese Genotype-phenotype Archive Dataset ID / DDBJ Sequence Read Archive ID": "Japanese Genotype-phenotype Archive Dataset ID / DDBJ Sequence Read Archive ID",
    "Genomic Expression Archive ID": "Genomic Expression Archive ID",
    "QC/Filtering方法": "QC/Filtering Methods",
    "SV数（QC後）": "SV Numbers (after QC)",
    "QC": "QC",
    "関連解析、メタ解析（ソフトウェア）": "Association Analysis & Meta Analysis (software)",
    "調整試薬（キット名、バージョン）": "Reagents (Kit, Version)",
    "フィルタリング": "Filtering",
    "NBDC Data Set ID": "NBDC Data Set ID",
    "マッピングクオリティ": "Mapping Quality",
    "遺伝子数": "Gene number",
    "関連解析（ソフトウェア）": "Association Analysis (software)",
    "eQTL検出方法": "eQTL detection method",
    "Genomic Expression Archive Data set ID": "Genomic Expression Archive Data set ID",
    // third
    "検体情報（購入の場合）": "Cell Lines",
    "ライブラリ構築方法": "Spot Type",
    "リード長（除：バーコード、アダプタ、プライマー、リンカー）": "Read Length (without Barcodes, Adaptors, Primers, and Linkers)",
    "マッピング方法": "Mapping Methods",
    "リファレンス配列": "Reference Genome Sequence",
    "平均カバー率（Depth）": "Coverage (Depth)",
    "対象遺伝子数": "Gene Numbers",
    "クオリティコントロール方法": "QC",
    "遺伝子型決定アルゴリズム（ソフトウェア）": "Genotype Call Methods (softwares)",
    "変異検出方法": "Variation Detection Methods",
    "コピー数決定アルゴリズム（ソフトウェア）": "Algorithm for detecting CNVs (software)",
    "マッピングの際のリファレンス配列": "Reference Genome Sequence",
    "リードカウント決定アルゴリズム（ソフトウェア）": "Detecting method for read count (software)",
    "構造変異検出方法": "Structural Variants Detection Methods",
    "構造多型数": "Polymorphism Number (after QC)",
    "重複するリードの除去": "Deduplication",
    "リアライメントおよびベースクオリティのキャリブレーション": "Calibration for re-alignment and base quality",
    "メチル化コール・メチル化率算出方法": "Detecting Methods for Variation",
    "遺伝子構造・新規の転写産物推定・発現量算出方法": "Detecting Methods for Variation",
    "マーカー数（imputation & QC後）": "Marker Number (after QC)",
    "クオリティコントロール方法（除外基準）": "QC",
    "平均カバー率": "Coverage (Depth)",
    "関連解析ソフトウェア": "Association Analysis (software)",
    "発現量算出方法（ソフトウェア等）": "Detecting Methods for Transcripts",
    "対象領域": "Target Loci for Capture Methods",
    "Platform（ハードウェア）": "Platform",
    "測定パラメータ": "Parameters",
    "定量対象領域": "Metabolic biomarkers",
    "コピー数変化領域決定アルゴリズム（ソフトウェア）": "Genotype Call Methods (software)",
    "MS数（QC後）": "SV Numbers (after QC)",
    "定量アルゴリズム": "Quantification Methods (software)",
    "Visiumデータ解析ソフトウェア": "Software",
    "解析方法（ソフトウェア）": "Association Analysis (software)",
    "解析対象遺伝子数": "Gene Number",
  }

  // moldata_keys を再度考える
  const headerNew = ["日本語版の値", "英語版の値", "正規化・日本語", "正規化・英語", "Data Key", "humVersionIds"]
  const molDataKeysRowsJa: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  const molDataKeysRowsEn: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  const itemsJa = summarizedValue["ja"]["moldata-keys"]
  const itemsEn = summarizedValue["en"]["moldata-keys"]
  for (const itemJa of itemsJa) {
    if (molDataKeysRowsJa[itemJa.value] === undefined) {
      molDataKeysRowsJa[itemJa.value] = {
        ja: itemJa.value,
        en: null,
        normalizedJa: "",
        normalizedEn: "",
        dataKey: "",
        humVersionIds: [itemJa.humVersionId],
      }
    } else {
      molDataKeysRowsJa[itemJa.value].humVersionIds.push(itemJa.humVersionId)
    }
  }
  for (const itemEn of itemsEn) {
    if (molDataKeysRowsEn[itemEn.value] === undefined) {
      molDataKeysRowsEn[itemEn.value] = {
        en: itemEn.value,
        found: false,
        humVersionIds: [itemEn.humVersionId],
      }
    } else {
      molDataKeysRowsEn[itemEn.value].humVersionIds.push(itemEn.humVersionId)
    }
  }
  // sort and stringify humVersionIds
  for (const key in molDataKeysRowsJa) {
    if (molDataKeysRowsJa[key].humVersionIds) {
      molDataKeysRowsJa[key].humVersionIds = molDataKeysRowsJa[key].humVersionIds.sort().join(", ")
    }
  }
  for (const key in molDataKeysRowsEn) {
    if (molDataKeysRowsEn[key].humVersionIds) {
      molDataKeysRowsEn[key].humVersionIds = molDataKeysRowsEn[key].humVersionIds.sort().join(", ")
    }
  }
  const notFoundItemsJa = []
  for (const keyJa in molDataKeysRowsJa) {
    const humVersionIdsJa = molDataKeysRowsJa[keyJa].humVersionIds
    const itemsEn = Object.values(molDataKeysRowsEn).filter(item => item.humVersionIds === humVersionIdsJa)
    if (keyJa in MAPPER) {
      molDataKeysRowsJa[keyJa].en = MAPPER[keyJa]
      molDataKeysRowsEn[MAPPER[keyJa]].found = true
      continue
    }
    if (itemsEn.length === 1) {
      molDataKeysRowsJa[keyJa].en = itemsEn[0].en
      molDataKeysRowsEn[itemsEn[0].en].found = true
    } else if (itemsEn.length > 1) {
      notFoundItemsJa.push(molDataKeysRowsJa[keyJa])
      // console.log("Multiple items found for", keyJa, ":", itemsEn.map(item => item.en))
    } else {
      notFoundItemsJa.push(molDataKeysRowsJa[keyJa])
      // console.log("No items found for", keyJa)
    }
  }
  const notFoundEn = Object.values(molDataKeysRowsEn).filter(item => !item.found)
  if (notFoundItemsJa.length > 0) {
    const titleAndIds = notFoundItemsJa.map(item => {
      return [item.ja, item.humVersionIds]
    })
    // console.log(JSON.stringify(titleAndIds, null, 2))
  }
  if (notFoundEn.length > 0) {
    const titleAndIds = notFoundEn.map(item => {
      return [item.en, item.humVersionIds]
    })
    // console.log(JSON.stringify(titleAndIds, null, 2))
    // const notFoundEnTitles = notFoundEn.map(item => item.en)
    // console.log("Not found En items:", notFoundEnTitles)
  }

  const moldataKeysFilePath = join(summaryJsonDir, "summarized-moldata-keys.tsv")
  writeFileSync(
    moldataKeysFilePath,
    [
      headerNew.join("\t"),
      ...Object.values(molDataKeysRowsJa).map(row => [
        row.ja,
        row.en ?? "",
        row.normalizedJa,
        row.normalizedEn,
        row.dataKey,
        row.humVersionIds,
      ].join("\t")),
      ...Object.values(notFoundEn).map(row => [
        "",
        row.en,
        "",
        "",
        "",
        row.humVersionIds,
      ].join("\t")),
    ].join("\n"),
  )

  const filteringAndQcKeys = [
    "Filtering",
    "QC/Filtering Methods",
    "フィルタリング",
    "Filtering Methods",
    "Filtering Methods (normalization, QC)",
    "QC",
    "QC Methods",
    "QC methods",
  ]
  const filteringAndQcValuesEn = []
  for (const humId of humIds) {
    if (["hum0003"].includes(humId)) {
      continue
    }
    const latestVersionNum = await findLatestVersionNum(humId, useCache)
    for (let versionNum = 1; versionNum <= latestVersionNum; versionNum++) {
      const humVersionId = `${humId}-v${versionNum}`
      const jsonData = loadDetailJson(humVersionId, "en", useCache)
      for (const molData of jsonData.molecularData.flatMap(molData => molData.data)) {
        for (const [key, value] of Object.entries(molData)) {
          if (filteringAndQcKeys.includes(key)) {
            filteringAndQcValuesEn.push({ humVersionId, value })
          }
        }
      }
    }
  }
  writeFileSync(
    join(summaryJsonDir, "filtering-and-qc-values-en.json"),
    JSON.stringify(filteringAndQcValuesEn, null, 2),
  )
}
