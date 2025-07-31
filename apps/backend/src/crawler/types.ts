export type LangType = "ja" | "en"

// === Schema for Elasticsearch JSON ===

export interface Address {
  country?: string | null
  state?: string | null
  city?: string | null
  street?: string | null
  postalCode?: string | null
}

export interface Organization {
  name: string
  abbreviation?: string | null
  url?: string | null
  type?: "institution" | "company" | "government" | "non-profit" | "consortium" | "agency" | "other" | null
  address?: Address | null
  rorId?: string | null // Research Organization Registry ID
}

export interface ResearchProject {
  name: string
  url?: string | null
}

export interface Person {
  name: string
  email?: string | null
  orcid?: string | null
  organization?: Organization | null
  datasetIds?: string[] // IDs of datasets related to this person
  researchTitle?: string | null // Title of the research this person is involved in
  periodOfDataUse?: string | null // Period during which the person can access the data
}

export interface Grant {
  id: string
  title: string
  agency: Organization
}

export interface Publication {
  title: string
  authors: Person[]
  consortiums: Organization[]
  status: "published" | "unpublished" | "in-press"
  year: number
  journal?: string | null
  volume?: string | null
  issue?: string | null
  startPage?: string | null
  endPage?: string | null
  datePublished?: string | null
  doi?: string | null
  url?: string | null
  pubMedId?: string | null
  datasetIds?: string[] // IDs of datasets related to this publication
}

// es entry: /research/{humId}-{lang}
export interface Research {
  humId: string
  lang: LangType
  title: string
  url: string
  dataProvider: Person[]
  researchProject: ResearchProject[]
  grant: Grant[]
  relatedPublication: Publication[]
  controlledAccessUser: Person[]
  summary: {
    aims: string
    methods: string
    targets: string
    url: {
      url: string
      text: string
    }[]
  }
  versions: ResearchVersion[]
}

// es entry: /researchVersion/{humId}-{versionNum}-{lang}
export interface ResearchVersion {
  humId: string
  lang: LangType
  version: string
  humVersionId: string
  datasets: Dataset[]
  releaseDate: string
  releaseNote: string[]
}

// datasetId として用いるもの
// - JGAD
// - DRA
// - E-GEAD
// - MTBK
// - hum.v1.rna - seq.v1
// - PRJDB10452
// es entry: /dataset/{datasetId}-{versionNum}-{lang}
export interface Dataset {
  datasetId: string
  lang: LangType
  version: number
  typeOfData?: string[] | null
  criteria?: string[] | null
  releaseDate?: string[] | null
  experiments: Experiment[]
}

// Table の中身 (現状は Record<string, string> で定義しているが、将来的にはもっと詳細な型にする)
// 解析手法ごと
export interface Experiment {
  header: string
  data: Record<string, string | null>
  footers: string[]
}
