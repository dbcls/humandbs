export type LangType = "ja" | "en"

export interface TextValue {
  text: string
  rawHtml: string
}

export interface UrlValue {
  text: string
  url: string
}

export interface Dataset {
  datasetId: string | null
  typeOfData: string | null
  criteria: string | null
  releaseDate: string | null
}

export interface Summary {
  aims: TextValue
  methods: TextValue
  targets: TextValue
  url: UrlValue[]
  datasets: Dataset[]
  footers: TextValue[]
}

export interface MolecularData {
  // Identifier text shown above the table (may include accessions)
  id: TextValue
  // Key-value map of table rows; value is normalized HTML or null for absent "-"
  data: Record<string, TextValue | null>
  footers: TextValue[]
}

export interface Grant {
  grantName: string | null
  projectTitle: string | null
  grantId: string | null
}

export interface DataProvider {
  principalInvestigator: TextValue[]
  affiliation: TextValue[]
  projectName: TextValue[]
  projectUrl: UrlValue[]
  grants: Grant[]
}

export interface Publication {
  title: string | null
  doi: string | null
  datasetIds: string[]
}

export interface ControlledAccessUser {
  principalInvestigator: string | null
  affiliation: string | null
  country: string | null
  researchTitle: string | null
  datasetIds: string[]
  periodOfDataUse: string | null
}

export interface Release {
  humVersionId: string
  releaseDate: string
  content: string
  releaseNote: TextValue
}

export interface ParseResult {
  summary: Summary
  molecularData: MolecularData[]
  dataProvider: DataProvider
  publications: Publication[]
  controlledAccessUsers: ControlledAccessUser[]
  releases: Release[]
}

// Normalized definition

export type CriteriaCanonical =
  | "Controlled-access (Type I)"
  | "Controlled-access (Type II)"
  | "Unrestricted-access"

export interface NormalizedDataset extends Omit<Dataset, "datasetId" | "criteria" | "releaseDate"> {
  datasetId: string[] | null
  criteria: CriteriaCanonical[] | null
  releaseDate: string[] | null
}

export interface NormalizedMolecularData extends Omit<MolecularData, "data"> {
  data: Record<string, TextValue | TextValue[] | null>
}

export interface NormalizedGrant extends Omit<Grant, "grantId"> {
  grantId: string[] | null
}

export interface NormalizedControlledAccessUser extends Omit<ControlledAccessUser, "periodOfDataUse"> {
  periodOfDataUse: {
    startDate: string | null
    endDate: string | null
  } | null
}

export interface NormalizedParseResult extends Omit<ParseResult, "summary" | "molecularData" | "dataProvider" | "controlledAccessUsers"> {
  summary: Omit<ParseResult["summary"], "datasets"> & {
    datasets: NormalizedDataset[]
  }
  molecularData: NormalizedMolecularData[]
  dataProvider: Omit<DataProvider, "grants"> & {
    grants: NormalizedGrant[]
  }
  controlledAccessUsers: NormalizedControlledAccessUser[]
}

// CLI arguments for crawl command.
export interface CrawlArgs {
  humId?: string
  lang?: LangType
  noCache?: boolean
  concurrency?: number
}
