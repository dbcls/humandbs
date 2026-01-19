// === CLI Types ===

/** CLI arguments for crawler commands */
export interface CrawlArgs {
  humId?: string
  lang?: LangType
  force?: boolean
  concurrency?: number
  noCache?: boolean
}

/** Result of parsing one humVersionId + lang */
export interface CrawlOneResult {
  success: boolean
  hasRelease: boolean
  error?: string
}

/** Result of normalizing one humVersionId + lang */
export interface NormalizeOneResult {
  success: boolean
  humVersionId: string
  lang: LangType
  error?: string
}

/** Result of parsing all versions for one humId */
export interface CrawlHumIdResult {
  parsed: number
  errors: number
  noRelease: number
}

/** Successful transform result */
export interface TransformOneSuccess {
  success: true
  humId: string
  lang: LangType
  data: {
    research: TransformedResearch
    versions: TransformedResearchVersion[]
    datasets: TransformedDataset[]
  }
}

/** Failed transform result */
export interface TransformOneFailure {
  success: false
  humId: string
  lang: LangType
  error: string
}

/** Result of transforming one humId + lang (discriminated union) */
export type TransformOneResult = TransformOneSuccess | TransformOneFailure

// === Common Types ===

/** Language type for ja/en versions */
export type LangType = "ja" | "en"

/** Text with normalized text and original raw HTML */
export interface TextValue {
  text: string
  rawHtml: string
}

/** URL with display text and actual URL */
export interface UrlValue {
  text: string
  url: string
}

// === Parse Types (output of HTML parsing) ===
/** Dataset information from summary table */
export interface Dataset {
  datasetId: string | null
  typeOfData: string | null
  criteria: string | null
  releaseDate: string | null
}

/** Summary section of a detail page */
export interface Summary {
  aims: TextValue
  methods: TextValue
  targets: TextValue
  url: UrlValue[]
  datasets: Dataset[]
  footers: TextValue[]
}

/** Molecular data table (one table per dataset) */
export interface MolecularData {
  /** Identifier text shown above the table (may include accessions) */
  id: TextValue
  /** Key-value map of table rows; value is normalized HTML or null for absent "-" */
  data: Record<string, TextValue | null>
  footers: TextValue[]
}

/** Grant information from data provider section */
export interface Grant {
  grantName: string | null
  projectTitle: string | null
  grantId: string[]
}

/** Data provider section */
export interface DataProvider {
  principalInvestigator: TextValue[]
  affiliation: TextValue[]
  projectName: TextValue[]
  projectUrl: UrlValue[]
  grants: Grant[]
}

/** Publication entry */
export interface Publication {
  title: string | null
  doi: string | null
  datasetIds: string[]
}

/** Controlled access user entry */
export interface ControlledAccessUser {
  principalInvestigator: string | null
  affiliation: string | null
  country: string | null
  researchTitle: string | null
  datasetIds: string[]
  periodOfDataUse: string | null
}

/** Release entry from release page */
export interface Release {
  humVersionId: string
  releaseDate: string
  content: string
  releaseNote?: TextValue
}

/** Complete parse result for a single humVersionId + lang */
export interface ParseResult {
  summary: Summary
  molecularData: MolecularData[]
  dataProvider: DataProvider
  publications: Publication[]
  controlledAccessUsers: ControlledAccessUser[]
  releases: Release[]
}

// === Normalized Types (output of normalization) ===

/** Canonical criteria values after normalization */
export type CriteriaCanonical =
  | "Controlled-access (Type I)"
  | "Controlled-access (Type II)"
  | "Unrestricted-access"

/** Normalized dataset with array fields */
export interface NormalizedDataset extends Omit<Dataset, "datasetId" | "criteria" | "releaseDate"> {
  datasetId: string[] | null
  criteria: CriteriaCanonical[] | null
  releaseDate: string[] | null
}

/** Normalized molecular data with possible array values */
export interface NormalizedMolecularData extends Omit<MolecularData, "data"> {
  data: Record<string, TextValue | TextValue[] | null>
}

/** Normalized grant with nullable grantId */
export interface NormalizedGrant extends Omit<Grant, "grantId"> {
  grantId: string[] | null
}

/** Normalized controlled access user with structured periodOfDataUse */
export interface NormalizedControlledAccessUser extends Omit<ControlledAccessUser, "periodOfDataUse"> {
  periodOfDataUse: {
    startDate: string | null
    endDate: string | null
  } | null
}

/** Complete normalized parse result */
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

// === Transform Types (output of transformation to ES structure) ===

/** Dataset ID type prefixes */
export type DatasetIdType =
  | "JGAD"
  | "JGAS"
  | "DRA"
  | "GEA"
  | "NBDC_DATASET"
  | "BP"
  | "METABO"

/** Extracted ID collections keyed by type */
export type ExtractedIds = Partial<Record<DatasetIdType, Set<string>>>

/** Experiment (inverted molecular data row) */
export interface TransformedExperiment {
  header: TextValue
  data: Record<string, TextValue | TextValue[] | null>
  footers: TextValue[]
}

/** Transformed dataset for ES indexing */
export interface TransformedDataset {
  // Identifiers
  datasetId: string
  lang: LangType
  version: string
  /** Release date when this version first appeared */
  versionReleaseDate: string

  // Parent references
  humId: string
  humVersionId: string

  // Metadata (from summary.datasets)
  typeOfData: string | null
  criteria: string[] | null  // Display values (language-specific)
  releaseDate: string[] | null

  // Experiments (inverted molecularData)
  experiments: TransformedExperiment[]
}

/** Transformed research version */
export interface TransformedResearchVersion {
  humId: string
  lang: LangType
  version: string
  humVersionId: string
  datasetIds: string[]
  releaseDate: string
  releaseNote: TextValue
}

/** Transformed person (data provider or controlled access user) */
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

/** Transformed research project */
export interface TransformedResearchProject {
  name: TextValue
  url?: UrlValue | null
}

/** Transformed grant */
export interface TransformedGrant {
  id: string[]
  title: string
  agency: { name: string }
}

/** Transformed publication */
export interface TransformedPublication {
  title: string
  doi?: string | null
  datasetIds?: string[]
}

/** Transformed research for ES indexing */
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

// === LLM Extraction Types ===

/** Subject count type */
export type SubjectCountType = "individual" | "sample" | "mixed"

/** Health status */
export type HealthStatus = "healthy" | "affected" | "mixed"

/** Read type */
export type ReadType = "single-end" | "paired-end"

/** Disease information */
export interface DiseaseInfo {
  label: string
  icd10: string | null
}

/** Platform information */
export interface PlatformInfo {
  vendor: string
  model: string
}

/** Experiment-level extracted fields */
export interface ExtractedExperimentFields {
  // Subject/sample info
  subjectCount: number | null
  subjectCountType: SubjectCountType | null
  healthStatus: HealthStatus | null

  // Disease info
  disease: DiseaseInfo | null

  // Biological sample info
  tissue: string | null
  isTumor: boolean | null
  cellLine: string | null

  // Experimental method
  assayType: string | null
  libraryKit: string | null

  // Platform
  platformVendor: string | null
  platformModel: string | null
  readType: ReadType | null
  readLength: number | null

  // Target region
  targets: string | null

  // Data info
  fileTypes: string[]
  dataVolumeBytes: number | null
}

/** Dataset-level searchable aggregated fields */
export interface SearchableDatasetFields {
  // Diseases
  diseases: DiseaseInfo[]

  // Biological samples
  tissues: string[]

  // Experimental methods
  assayTypes: string[]

  // Platforms
  platforms: PlatformInfo[]
  readTypes: string[]

  // Data info
  fileTypes: string[]
  totalSubjectCount: number | null
  totalDataVolumeBytes: number | null

  // Flags
  hasHealthyControl: boolean
  hasTumor: boolean
  hasCellLine: boolean
}

/** Experiment with extracted fields */
export interface ExtractedExperiment extends TransformedExperiment {
  extracted: ExtractedExperimentFields
}

/** Dataset with searchable fields */
export interface SearchableDataset extends Omit<TransformedDataset, "experiments"> {
  searchable: SearchableDatasetFields
  experiments: ExtractedExperiment[]
}
