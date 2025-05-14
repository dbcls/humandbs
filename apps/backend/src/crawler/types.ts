export type LangType = "ja" | "en"

// === Schema for Elasticsearch JSON ===

interface Research {
  humId: string
  title: string
  url: string
  dataProvider: {
    principalInvestigator: {
      name: string
      affiliation: string
    }[]
    researchProject: {
      name: string
      url: string
    }
  }
  grant: { // JGA study
    id: string
    title: string
    agency: string
  }[]
  relatedPublication: { // TODO
    title: string
    doi: string
    datasetId: string[]
  }[]
  controlledAccessUser: {
    name: string
    affiliation: string
    country: string
    researchTitle: string
    datasetId: string[]
    usagePeriod: {
      startDate: string
      endDate: string
    }
  }[]
  version: ResearchVersion[]
}

interface ResearchVersion {
  humId: string
  version: string
  humVersionId: string
  dataset: Dataset[]
  releaseDate: string
  releaseNote: string
}

// Ref: MolecularData, JGA Experiment, JGA Dataset, JGA Analysis, JGA Data
interface Dataset {
  datasetType: string
}
