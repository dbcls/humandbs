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
  grantId: string[]
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
  releaseNote?: TextValue
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

// CLI arguments for crawler commands.
export interface CrawlArgs {
  humId?: string
  lang?: LangType
  force?: boolean
  concurrency?: number
}

// Result of parsing one humVersionId + lang
export interface CrawlOneResult {
  success: boolean
  hasRelease: boolean
  error?: string
}

// Result of parsing all versions for one humId
export interface CrawlHumIdResult {
  parsed: number
  errors: number
  noRelease: number
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
  /** この version が初出現した release の日付 */
  versionReleaseDate: string

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

// === LLM 抽出フィールド用の型定義 ===

/** 被験者数のカウントタイプ */
export type SubjectCountType = "individual" | "sample" | "mixed"

/** 健康状態 */
export type HealthStatus = "healthy" | "affected" | "mixed"

/** リードタイプ */
export type ReadType = "single-end" | "paired-end"

/** 疾患情報 */
export interface DiseaseInfo {
  label: string
  icd10: string | null
}

/** プラットフォーム情報 */
export interface PlatformInfo {
  vendor: string
  model: string
}

/** Experiment レベルの抽出フィールド */
export interface ExtractedExperimentFields {
  // 被験者・サンプル情報
  subjectCount: number | null
  subjectCountType: SubjectCountType | null
  healthStatus: HealthStatus | null

  // 疾患情報
  disease: DiseaseInfo | null

  // 生体試料情報
  tissue: string | null
  isTumor: boolean | null
  cellLine: string | null

  // 実験手法
  assayType: string | null
  libraryKit: string | null

  // プラットフォーム
  platformVendor: string | null
  platformModel: string | null
  readType: ReadType | null
  readLength: number | null

  // 対象領域
  targets: string | null

  // データ情報
  fileTypes: string[]
  dataVolumeBytes: number | null
}

/** Dataset レベルの検索用集約フィールド */
export interface SearchableDatasetFields {
  // 疾患
  diseases: DiseaseInfo[]

  // 生体試料
  tissues: string[]

  // 実験手法
  assayTypes: string[]

  // プラットフォーム
  platforms: PlatformInfo[]
  readTypes: string[]

  // データ情報
  fileTypes: string[]
  totalSubjectCount: number | null
  totalDataVolumeBytes: number | null

  // フラグ
  hasHealthyControl: boolean
  hasTumor: boolean
  hasCellLine: boolean
}

/** 抽出フィールドを含む Experiment */
export interface ExtractedExperiment extends TransformedExperiment {
  extracted: ExtractedExperimentFields
}

/** 検索可能フィールドを含む Dataset */
export interface SearchableDataset extends Omit<TransformedDataset, "experiments"> {
  searchable: SearchableDatasetFields
  experiments: ExtractedExperiment[]
}
