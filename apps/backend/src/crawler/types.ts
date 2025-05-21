export type LangType = "ja" | "en"

// === Schema for Elasticsearch JSON ===

export interface Research {
  humId: string
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
  version: ResearchVersion[]
}

export interface ResearchVersion {
  humId: string
  version: string
  humVersionId: string
  datasets: DatasetVersion[]
  releaseDate: string
  releaseNote: string[]
}

// Ref: MolecularData, JGA Experiment, JGA Dataset, JGA Analysis, JGA Data
export interface DatasetVersion {
  datasetId: string
  datasetVersion: string
  humDatasetId: string
  humVersionIds: string[]
  data: Record<string, string>
  footers: string[]
  typeOfData: string[]
  criteria: string[]
  releaseDate: string[]
}

export interface Dataset {
  datasetId: string
  humDatasetIds: string[]
}
