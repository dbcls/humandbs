export type LangType = "ja" | "en"

// export interface Research {
//   humId: string // hum0001
//   version: string // v1
//   humVersionId: string // hum0001.v1
//   url: string // https://humandbs.dbcls.jp/hum0001-v1
//   summary: Summary
// }

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

// interface DataProvider {
//   principalInvestigator: string[]
//   affiliation: string[]
//   projectName: string[]
//   projectUrl: string[]
//   grants: Grant[]
// }
// type DataProviderKeys = keyof DataProvider

// === Schema for Elasticsearch JSON ===

interface Research {
  humId: string
  title: string
  url: string
  dataProvider: {
    principalInvestigator: {
      name: string
      affiliation: string // TODO lab_name ref JGA Submission
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
