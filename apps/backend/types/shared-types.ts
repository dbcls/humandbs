export type LangType = "ja" | "en"

// === Schema for Elasticsearch JSON ===

export interface Research {
  humId: string
  lang: LangType
  title: string
  url: string
  dataProvider: {
    principalInvestigator: string[]
    affiliation: string[]
    researchProjectName: string[]
    researchProjectUrl: string[]
  }
  grant: { // JGA study
    id: string
    title: string
    agency: string
  }[]
  relatedPublication: { // TODO
    title: string
    doi: string
    datasetIds: string[]
  }[]
  controlledAccessUser: {
    name: string | null
    affiliation: string | null
    country: string | null
    researchTitle: string | null
    datasetId: string[]
    periodOfDataUse: string | null
  }[]
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

// primary key: humVersionId: `${humId}-v${versionNum}`
export interface ResearchVersion {
  humId: string
  lang: LangType
  version: string
  humVersionId: string
  datasets: DatasetVersion[]
  releaseDate: string
  releaseNote: string[]
}

// Ref: MolecularData, JGA Experiment, JGA Dataset, JGA Analysis, JGA Data
// primary key: humDatasetId: `${humId}-${datasetId}-v${latestVersionId + 1}`
export interface DatasetVersion {
  datasetId: string
  lang: LangType
  datasetVersion: string
  humDatasetId: string
  humVersionIds: string[]
  data: Record<string, string>
  footers: string[]
  typeOfData: string[]
  criteria: string[]
  releaseDate: string[]
}
