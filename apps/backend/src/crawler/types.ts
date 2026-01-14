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

// === Transform 用の型定義 ===

/** Dataset ID の種類 */
export type DatasetIdType =
  | "JGAD"
  | "JGAS"
  | "DRA"
  | "GEA"
  | "NBDC_DATASET"
  | "BP"
  | "METABO"

/** 抽出された ID の集合 */
export type ExtractedIds = Partial<Record<DatasetIdType, Set<string>>>

/** Experiment (molTable の1行分、裏返し後) */
export interface TransformedExperiment {
  header: TextValue
  data: Record<string, TextValue | TextValue[] | null>
  footers: TextValue[]
}

/** 変換後の Dataset */
export interface TransformedDataset {
  // Identifiers
  datasetId: string
  lang: LangType
  version: string

  // Parent references
  humId: string
  humVersionId: string

  // Metadata (from summary.datasets)
  typeOfData: string[] | null
  criteria: CriteriaCanonical[] | null
  releaseDate: string[] | null

  // Experiments (inverted molecularData)
  experiments: TransformedExperiment[]
}

/** 変換後の ResearchVersion */
export interface TransformedResearchVersion {
  humId: string
  lang: LangType
  version: string
  humVersionId: string
  datasetIds: string[]
  releaseDate: string
  releaseNote: TextValue
}

/** 変換後の Person */
export interface TransformedPerson {
  name: TextValue
  email?: string | null
  orcid?: string | null
  organization?: {
    name: TextValue
    address?: { country?: string | null } | null
  } | null
  datasetIds?: string[]
  researchTitle?: string | null
  periodOfDataUse?: {
    startDate: string | null
    endDate: string | null
  } | null
}

/** 変換後の ResearchProject */
export interface TransformedResearchProject {
  name: TextValue
  url?: UrlValue | null
}

/** 変換後の Grant */
export interface TransformedGrant {
  id: string[]
  title: string
  agency: { name: string }
}

/** 変換後の Publication */
export interface TransformedPublication {
  title: string
  doi?: string | null
  datasetIds?: string[]
}

/** 変換後の Research */
export interface TransformedResearch {
  // Identifiers
  humId: string
  lang: LangType

  // Core display info
  title: string
  url: string

  // Summary (from latest version)
  summary: {
    aims: TextValue
    methods: TextValue
    targets: TextValue
    url: UrlValue[]
    footers: TextValue[]
  }

  // Data provider
  dataProvider: TransformedPerson[]

  // Research project
  researchProject: TransformedResearchProject[]

  // Grant information
  grant: TransformedGrant[]

  // Publications (accumulated)
  relatedPublication: TransformedPublication[]

  // Controlled access users (accumulated)
  controlledAccessUser: TransformedPerson[]

  // Version references
  versionIds: string[]
  latestVersion: string

  // Timestamps
  firstReleaseDate: string
  lastReleaseDate: string
}
