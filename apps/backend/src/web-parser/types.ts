export type LangType = "ja" | "en"

export interface ResearchSeries {
  humId: string // hum0001
  versions: Record<string, Research> // key: v1
  latestVersion: string // v1
}

export interface Research {
  humId: string // hum0001
  version: string // v1
  humVersionId: string // hum0001.v1
  url: string // https://humandbs.dbcls.jp/hum0001-v1
  summary: Summary
}

export interface SummaryUrl {
  url: string
  text: string
}

export interface Summary {
  aims: string
  methods: string
  targets: string
  url: SummaryUrl[]
}

// also see: JGA Study (Grant)
// export interface Grant { }
