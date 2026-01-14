import type { ParseResult } from "@/crawler/detail-parser"
import type { LangType } from "@/types"

export const normalizer = ((lang: LangType, parserResult: ParseResult): void => {
  if (lang === "en") {
    parserResult.summary.aims = normalizeEnText(parserResult.summary.aims)
    parserResult.summary.methods = normalizeEnText(parserResult.summary.methods)
    parserResult.summary.targets = normalizeEnText(parserResult.summary.targets)
    for (const dataset of parserResult.datasets) {
      dataset.criteria = dataset.criteria.map(normalizeDatasetsCriteriaEn)
      dataset.dataId = normalizeDatasetDataIdEn(dataset.dataId)
      dataset.releaseDate = normalizeDatasetReleaseDateEn(dataset.releaseDate)
    }
    for (const molData of parserResult.molecularData) {
      // molData.data = normalizeMolDataKeysJa(molData.data)
      molData.footers = filterFooterEn(molData.footers)
    }
    parserResult.dataProvider.affiliation = normalizeDataProAffiliation(parserResult.dataProvider.affiliation)
    parserResult.dataProvider.principalInvestigator = normalizeDataProPi(parserResult.dataProvider.principalInvestigator)
    parserResult.dataProvider.projectName = normalizeProjectName(parserResult.dataProvider.projectName)
  } else if (lang === "ja") {
    for (const dataset of parserResult.datasets) {
      dataset.criteria = dataset.criteria.map(normalizeDatasetsCriteriaJa)
      dataset.dataId = normalizeDatasetDataIdJa(dataset.dataId)
      dataset.releaseDate = normalizeDatasetReleaseDateJa(dataset.releaseDate)
    }
    for (const molData of parserResult.molecularData) {
      molData.id = normalizeEnText(molData.id)
      molData.data = normalizeMolDataKeysJa(molData.data)
      molData.footers = filterFooterJa(molData.footers)
    }
    parserResult.dataProvider.affiliation = normalizeDataProAffiliation(parserResult.dataProvider.affiliation)
    parserResult.dataProvider.principalInvestigator = normalizeDataProPi(parserResult.dataProvider.principalInvestigator)
    parserResult.dataProvider.projectName = normalizeProjectName(parserResult.dataProvider.projectName)
  }
})

export const normalizeEnText = (text: string): string => {
  return text
    .replace(/\u00A0/g, " ") // non-breaking space
    .replace(/‘/g, "'")
    .replace(/’/g, "'")
    .replace(/　/g, " ")
    .replace(/：/g, ": ")
    .replace(/–/g, "-")
    .replace(/／/g, "/")
    .replace(/：/g, ": ")
    .replace(/ {2,}/g, " ")
}

export type CriteriaEn = "Controlled-access (Type I)" | "Controlled-access (Type II)" | "Unrestricted-access"

const normalizeDatasetsCriteriaEn = (text: string): CriteriaEn => {
  if ([
    "Controlled Access (Type I)",
    "Controlled-Access (Type I)",
    "Controlled-access (Type I)",
  ].includes(text)) {
    return "Controlled-access (Type I)"
  } else if ([
    "Controlled Access (Type II)",
    "Controlled-Access (Type II)",
    "Controlled-access (Type II)",
  ].includes(text)) {
    return "Controlled-access (Type II)"
  } else if ([
    "Un-restricted Access",
    "Unrestricted Access",
    "Unrestricted-access",
  ].includes(text)) {
    return "Unrestricted-access"
  } else {
    throw new Error(`Invalid criteria: ${text}`)
  }
}

export type CriteriaJa = "制限公開 (Type I)" | "制限公開 (Type II)" | "非制限公開"

const normalizeDatasetsCriteriaJa = (text: string): CriteriaJa => {
  if ([
    "制限公開(Type I)",
    "制限公開（Type I）",
    "制限公開 (Type I)",
  ].includes(text)) {
    return "制限公開 (Type I)"
  } else if ([
    "制限公開(Type II)",
    "制限公開（Type II）",
    "制限公開 (Type II)",
  ].includes(text)) {
    return "制限公開 (Type II)"
  } else if ([
    "非制限公開",
  ].includes(text)) {
    return "非制限公開"
  } else {
    throw new Error(`Invalid criteria: ${text}`)
  }
}

const normalizeDatasetDataIdEn = (values: string[]): string[] => {
  return values
    .filter((value) => !["(Data addition)"].includes(value))
    .map((value) => {
      if (value === "35 Dieases") {
        return "35 Diseases"
      }
      if (value === "(JGA000122)") {
        return "JGA000122"
      }
      value = value.replace(/\(.*\)/g, "").trim()
      value = value.replace(/（.*）/g, "").trim() // Full-width parentheses
      value = value.replace(/data addition/g, "").trim()
      return value
    })
}

const normalizeDatasetDataIdJa = (values: string[]): string[] => {
  return values
    .filter((value) => !["データ追加"].includes(value))
    .map((value) => {
      if (value === "（JGA000122）") {
        return "JGA000122"
      }
      value = value.replace(/\(.*\)/g, "").trim()
      value = value.replace(/（.*）/g, "").trim() // Full-width parentheses
      value = value.replace(/データ追加/g, "").trim()
      value = value.replace(/にデータ追加/g, "").trim()
      value = value.replace(/追加/g, "").trim()
      value = value.replace(/に/g, "").trim()
      value = value.replace(/、/g, ",").trim()
      return value
    })
}

export function normalizeDateArray(dates: string[]): string[] {
  return dates
    .map((date) => {
      const [year, month, day] = date.split("/").map((v) => v.padStart(2, "0"))
      return `${year}-${month}-${day}`
    })
}

export function normalizeDate(date: string): string | null {
  const [year, month, day] = date.split("/").map((v) => v.padStart(2, "0"))
  const isoDate = `${year}-${month}-${day}`
  const parsedDate = new Date(isoDate)

  if (isNaN(parsedDate.getTime())) {
    // TODO: check
    return null
    // throw new Error(`Invalid date string: "${date}"`)
  }

  return isoDate
}

const normalizeDatasetReleaseDateEn = (values: string[]): string[] => {
  return normalizeDateArray(
    values
      .filter((value) => !["Coming soon"].includes(value)),
  )
}

const normalizeDatasetReleaseDateJa = (values: string[]): string[] => {
  return normalizeDateArray(
    values
      .filter((value) => !["近日公開予定"].includes(value)),
  )
}

const KEY_FORMAT_JA = {
  "Genomic Expression Archive ID": [
    "Genomic Expression Archive Data set ID",
    "Genomic Expression Archive ID",
  ],
  "Japan Genotype-Phenotype Archive Dataset ID": [
    "Japanese Genotype-phenotype Archive Data set ID",
    "Japanese Genotype-phenotype Archive Dataset ID",
  ],
  "NBDC Dataset ID": [
    "NBDC Data Set ID",
    "NBDC Dataset ID",
  ],
  "Platform": [
    "Platform",
    "Platform（ハードウェア）",
  ],
  "QC Method": [
    "QC",
    "QC/Filtering方法",
    "QC方法",
    "フィルタリング",
    "フィルタリング（QC）",
    "フィルタリング（QC）方法",
    "フィルタリング（ノーマライズ、QC方法）",
  ],
  "クオリティコントロール方法": [
    "クオリティコントロール方法",
    "クオリティコントロール方法（除外基準）",
  ],
  "マーカー数(QC後)": [
    "マーカー数(QC後)",
    "マーカー数（QC後）",
    "マーカー数（フィルタ後）",
    "マーカー数（フィルタ後）\n※ped/map形式ファイル",
  ],
  "平均カバー率": [
    "平均カバー率",
    "平均カバー率（Depth）",
  ],
  "ヒト配列排除方法": [
    "ヒト配列排除方法",
    "ヒト配列除去方法",
  ],
  "リード長": [
    "リード長（除：バーコード、アダプタ、プライマー、リンカー）",
    "リード長（除：バーコード、アダプター、プライマー、リンカー）",
  ],
  "変異検出方法": [
    "変異検出方法",
    "変異決定方法",
    "構造変異検出方法",
  ],
  "定量アルゴリズム": [
    "定量アルゴリズム",
    "定量アルゴリズム（ソフトウェア）",
  ],
  "対象": [
    "対象",
    "対象⋆4",
    "対象⋆１",
  ],
  "対象領域": [
    "対象領域",
    "対象領域（Target Captureの場合）",
  ],
  "断片化方法": [
    "断片化方法",
    "断片化の方法",
  ],
  "測定条件": [
    "測定条件",
    "測定パラメータ",
  ],
  "解析手法": [
    "解析手法",
    "解析手法（ソフトウェア）",
    "解析方法（ソフトウェア）",
  ],
  "重複するリードの除去方法": [
    "重複するリードの除去",
    "重複するリードの除去方法",
  ],
  "解析ソフトウェア": [
    "関連解析、メタ解析（ソフトウェア）",
    "関連解析ソフトウェア",
    "関連解析（ソフトウェア）",
    "解析ソフトウェア",
    "解析ソフトウェア（可視化ツールなど）",
    "メタ解析（ソフトウェア）",
  ],
  "調整試薬": [
    "試薬",
    "調整試薬（キット名、バージョン）",
    "調整試薬（パネル、キット名、バージョンなど）",
  ],
  "発現量算出方法": [
    "発現量決定方法（ソフトウェア）",
    "発現量算出方法（ソフトウェア等）",
  ],
  "遺伝子型決定アルゴリズム": [
    "遺伝子型/リードカウント決定アルゴリズム（ソフトウェア）",
    "遺伝子型決定アルゴリズム（ソフトウェア）",
  ],
  "リファレンス配列": [
    "リファレンス",
    "リファレンス配列",
    "マッピングの際のリファレンス配列",
  ],
  "コピー数変化領域決定アルゴリズム": [
    "コピー数変化領域決定アルゴリズム（ソフトウェア）",
    "コピー数決定アルゴリズム（ソフトウェア）",
  ],
}

const normalizeMolDataKeysJa = (molData: Record<string, any>): Record<string, any> => { // eslint-disable-line @typescript-eslint/no-explicit-any
  // return Object.fromEntries(
  //   Object.entries(molData).map(([key, value]) => {
  //     for (const [normalizedKey, keys] of Object.entries(KEY_FORMAT_JA)) {
  //       if (keys.includes(key)) {
  //         return [normalizedKey, value]
  //       }
  //     }
  //     return [key, value]
  //   }),
  // )
  return Object.fromEntries(
    Object.entries(molData).map(([key, value]) => {
      if (key.includes("\n")) {
        return [key.replace("\n", " "), value]
      }
      return [key, value]
    }),
  )
}

const FOOTER_FILTER_JA = [
  "※制限公開データの利用にあたっては",
  "※論文等でデータベースからダウンロードしたデータを含む結果を公表する際には",
]

const filterFooterJa = (texts: string[]): string[] => {
  return texts.filter((text) => {
    return !FOOTER_FILTER_JA.some((footer) => text.startsWith(footer))
  }).map((text) => {
    if (text.startsWith("*") || text.startsWith("※")) {
      return "* " + text.slice(1)
    } else {
      return text
    }
  }).map((text) => {
    return normalizeEnText(text)
  })
}

const FOOTER_FILTER_EN = [
  "*When the research results including the data which were downloaded from NHA/DRA",
  "When the research results including the data which were downloaded from NHA/DRA",
  " Data users need to apply the Form 2 (Application Form for Using NBDC Human Data) to reach the Controlled Access Data.",
]

const filterFooterEn = (texts: string[]): string[] => {
  return texts.filter((text) => {
    return !FOOTER_FILTER_EN.some((footer) => text.startsWith(footer))
  }).map((text) => {
    if (
      text.startsWith("This study was supported by ") ||
      text.startsWith("*This study was supported by ")
    ) {
      return text.replace("“", "\"").replace("”", "\"").replace("“", "\"")
        .replace("”", "\"")
    } else {
      return text
    }
  }).map((text) => {
    if (text.startsWith("*")) {
      return "* " + text.slice(1)
    } else {
      return text
    }
  }).map((text) => {
    return normalizeEnText(text)
  })
}

const normalizeDataProAffiliation = (texts: string[]): string[] => {
  return texts.map(normalizeEnText)
}

const normalizeDataProPi = (texts: string[]): string[] => {
  return texts.map(normalizeEnText).filter(text => text !== "")
}

const normalizeProjectName = (texts: string[]): string[] => {
  return texts.map(normalizeEnText).filter(text => text !== "")
}
