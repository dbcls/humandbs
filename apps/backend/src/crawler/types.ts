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
  title: string
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

  // Metadata (from summary.datasets) - must not be null
  typeOfData: string
  criteria: string[] // Display values (language-specific)
  releaseDate: string[]

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

/** Data volume with unit */
export type DataVolumeUnit = "KB" | "MB" | "GB" | "TB"

export interface DataVolume {
  value: number
  unit: DataVolumeUnit
}

/** Experiment-level extracted fields */
export interface ExtractedExperimentFields {
  // Subject/sample info
  subjectCount: number | null
  subjectCountType: SubjectCountType | null
  healthStatus: HealthStatus | null

  // Disease info (multiple diseases supported)
  diseases: DiseaseInfo[]

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
  dataVolume: DataVolume | null
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
  totalDataVolume: DataVolume | null

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

// === Enriched Types (output of external API enrichment) ===

/** Publication with DOI from Crossref */
export interface EnrichedPublication extends TransformedPublication {
  doi?: string | null
}

/** Dataset enriched with external API metadata */
export interface EnrichedDataset extends TransformedDataset {
  /** Raw metadata from external APIs (JGAD, DRA, etc.) */
  originalMetadata?: Record<string, unknown> | null
}

/** Research enriched with DOI information */
export interface EnrichedResearch extends Omit<TransformedResearch, "relatedPublication"> {
  relatedPublication: EnrichedPublication[]
}

/** Dataset with both enrichment and searchable fields */
export interface SearchableEnrichedDataset extends Omit<EnrichedDataset, "experiments"> {
  searchable: SearchableDatasetFields
  experiments: ExtractedExperiment[]
  originalMetadata?: Record<string, unknown> | null
}

// === Bilingual Types (for ja/en matching and extraction) ===

/** Match type for experiment pairing */
export type ExperimentMatchType =
  | "exact" // Matched by accession ID
  | "fuzzy" // Matched by header similarity
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for publication pairing */
export type PublicationMatchType =
  | "exact-doi" // Matched by DOI
  | "exact-datasetIds" // Matched by datasetIds
  | "fuzzy-title" // Matched by title similarity
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for grant pairing */
export type GrantMatchType =
  | "exact-grantId" // Matched by grantId overlap
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for controlled access user pairing */
export type ControlledAccessUserMatchType =
  | "exact-both" // Matched by datasetIds AND periodOfDataUse
  | "exact-datasetIds" // Matched by datasetIds only
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Match type for research project pairing */
export type ResearchProjectMatchType =
  | "exact-url" // Matched by URL
  | "fuzzy-name" // Matched by name similarity
  | "position" // Matched by index position
  | "unmatched-ja" // Only ja exists
  | "unmatched-en" // Only en exists

/** Bilingual experiment pair for LLM extraction */
export interface BilingualExperimentPair {
  experimentKey: string
  ja: TransformedExperiment | null
  en: TransformedExperiment | null
  matchType: ExperimentMatchType
}

/** Bilingual dataset with matched experiment pairs */
export interface BilingualDataset {
  datasetId: string
  version: string
  versionReleaseDate: string
  humId: string
  jaDataset: EnrichedDataset | null
  enDataset: EnrichedDataset | null
  experimentPairs: BilingualExperimentPair[]
  originalMetadata: Record<string, unknown> | null
}

/** Extracted bilingual experiment */
export interface ExtractedBilingualExperiment {
  experimentKey: string
  sourceJa: TransformedExperiment | null
  sourceEn: TransformedExperiment | null
  extracted: ExtractedExperimentFields
}

// === Unified Types (ja/en integrated structure) ===

/** Bilingual text field (language-dependent strings) */
export interface BilingualText {
  ja: string | null
  en: string | null
}

/** Bilingual TextValue field */
export interface BilingualTextValue {
  ja: TextValue | null
  en: TextValue | null
}

/** Bilingual UrlValue field */
export interface BilingualUrlValue {
  ja: UrlValue | null
  en: UrlValue | null
}

/** Unified experiment (ja/en pairs) */
export interface UnifiedExperiment {
  header: BilingualTextValue
  data: Record<string, BilingualTextValue | null>
  footers: {
    ja: TextValue[]
    en: TextValue[]
  }
  matchType: ExperimentMatchType
}

/** Unified dataset (language-integrated) */
export interface UnifiedDataset {
  // Language-independent
  datasetId: string
  version: string
  versionReleaseDate: string
  humId: string
  humVersionId: string
  releaseDate: string[] // must not be null
  criteria: CriteriaCanonical[] // must not be null

  // Language-dependent - at least one of ja/en must be non-null
  typeOfData: { ja: string | null; en: string | null }

  // Experiments (ja/en pairs)
  experiments: UnifiedExperiment[]
}

/** Unified summary (language-integrated) */
export interface UnifiedSummary {
  aims: BilingualTextValue
  methods: BilingualTextValue
  targets: BilingualTextValue
  url: {
    ja: UrlValue[]
    en: UrlValue[]
  }
  footers: {
    ja: TextValue[]
    en: TextValue[]
  }
}

/** Unified person (data provider or controlled access user) */
export interface UnifiedPerson {
  name: BilingualTextValue
  email?: string | null
  orcid?: string | null
  organization?: {
    name: BilingualTextValue
    address?: { country?: string | null } | null
  } | null
  datasetIds?: string[]
  researchTitle?: BilingualText
  periodOfDataUse?: {
    startDate: string | null
    endDate: string | null
  } | null
  matchType?: ControlledAccessUserMatchType
}

/** Unified research project */
export interface UnifiedResearchProject {
  name: BilingualTextValue
  url?: BilingualUrlValue | null
  matchType?: ResearchProjectMatchType
}

/** Unified grant */
export interface UnifiedGrant {
  id: string[]
  title: BilingualText
  agency: { name: BilingualText }
  matchType?: GrantMatchType
}

/** Unified publication */
export interface UnifiedPublication {
  title: BilingualText
  doi?: string | null
  datasetIds?: string[]
  matchType?: PublicationMatchType
}

/** Unified research (language-integrated) */
export interface UnifiedResearch {
  // Language-independent
  humId: string
  url: BilingualText

  // Language-dependent
  title: BilingualText
  summary: UnifiedSummary

  // Data provider
  dataProvider: UnifiedPerson[]

  // Research project
  researchProject: UnifiedResearchProject[]

  // Grant information
  grant: UnifiedGrant[]

  // Publications (accumulated)
  relatedPublication: UnifiedPublication[]

  // Controlled access users (accumulated)
  controlledAccessUser: UnifiedPerson[]

  // Version references
  versionIds: string[]
  latestVersion: string

  // Timestamps
  firstReleaseDate: string
  lastReleaseDate: string
}

/** Unified research version (language-integrated) */
export interface UnifiedResearchVersion {
  // Language-independent
  humId: string
  humVersionId: string
  version: string
  versionReleaseDate: string
  datasetIds: string[]

  // Language-dependent
  releaseNote: BilingualTextValue
}

// === Enriched Unified Types (output of external API enrichment for Unified structure) ===

/** Unified publication with DOI enrichment */
export interface EnrichedUnifiedPublication extends UnifiedPublication {
  doi?: string | null
}

/** Unified dataset enriched with external API metadata */
export interface EnrichedUnifiedDataset extends UnifiedDataset {
  originalMetadata?: Record<string, unknown> | null
}

/** Unified research enriched with DOI information */
export interface EnrichedUnifiedResearch extends Omit<UnifiedResearch, "relatedPublication"> {
  relatedPublication: EnrichedUnifiedPublication[]
}

// === Extracted Unified Types (output of LLM extraction for Unified structure) ===

/** Unified experiment with extracted fields (matchType excluded from output) */
export interface ExtractedUnifiedExperiment extends Omit<UnifiedExperiment, "matchType"> {
  extracted: ExtractedExperimentFields
}

/** Unified dataset with searchable fields */
export interface SearchableUnifiedDataset extends Omit<EnrichedUnifiedDataset, "experiments"> {
  searchable: SearchableDatasetFields
  experiments: ExtractedUnifiedExperiment[]
}
