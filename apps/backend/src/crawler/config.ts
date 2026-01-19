/**
 * Crawler configuration
 *
 * Centralized configuration for HumanDBs special cases and exceptions.
 */
import type { CriteriaCanonical, DatasetIdType, LangType } from "@/crawler/types"

// === URLs and Limits ===

/** Base URL for HumanDBs portal site (with trailing slash, for path concatenation) */
export const DETAIL_PAGE_BASE_URL = "https://humandbs.dbcls.jp/"

/** Base URL for HumanDBs (without trailing slash, for joining with paths starting with /) */
export const HUMANDBS_BASE_URL = "https://humandbs.dbcls.jp"

/** Default number of concurrent downloads */
export const DEFAULT_CONCURRENCY = 4

/** Maximum allowed concurrency */
export const MAX_CONCURRENCY = 32

/** Timeout for HEAD requests when resolving latest version (ms) */
export const HEAD_TIMEOUT_MS = 2000

/** Maximum version number to try when discovering versions */
export const MAX_VERSION = 50

// === Skip Pages ===

export interface SkipConfig {
  humVersionId: string
  lang: LangType
  reason: string
}

export const SKIP_PAGES: SkipConfig[] = [
  {
    humVersionId: "hum0003-v1",
    lang: "en",
    reason: "English version does not exist",
  },
]

export const shouldSkipPage = (humVersionId: string, lang: LangType): boolean => {
  return SKIP_PAGES.some(s => s.humVersionId === humVersionId && s.lang === lang)
}

// === Special Release URLs ===

export interface SpecialReleaseUrl {
  humVersionId: string
  lang: LangType
  suffix: string
}

export const SPECIAL_RELEASE_URLS: SpecialReleaseUrl[] = [
  { humVersionId: "hum0329-v1", lang: "ja", suffix: "-release-note" },
]

export const getReleaseSuffix = (humVersionId: string, lang: LangType): string => {
  const special = SPECIAL_RELEASE_URLS.find(
    s => s.humVersionId === humVersionId && s.lang === lang,
  )
  return special?.suffix ?? "-release"
}

// === Special Controlled Access Rows ===

export interface SpecialControlledAccessRow {
  humId: string
  cellCount: number
  firstCellText: string
  data: {
    principalInvestigator: string | null
    affiliation: string | null
    country: string | null
    researchTitle: string | null
    datasetIds: string[]
    periodOfDataUse: string | null
  }
}

export const SPECIAL_CONTROLLED_ACCESS_ROWS: SpecialControlledAccessRow[] = [
  {
    humId: "hum0014",
    cellCount: 5,
    firstCellText: "Atray Dixit",
    data: {
      principalInvestigator: "Atray Dixit",
      affiliation: "Coral Genomics, Inc.",
      country: null,
      researchTitle: "Derivation and Evaluation of Functional Response Scores",
      datasetIds: ["JGAD000101", "JGAD000123", "JGAD000124", "JGAD000144-JGAD000201", "JGAD000220"],
      periodOfDataUse: "2020/08/24-2021/07/21",
    },
  },
]

export const findSpecialControlledAccessRow = (
  humVersionId: string,
  cellCount: number,
  firstCellText: string,
): SpecialControlledAccessRow | undefined => {
  const humId = humVersionId.split("-v")[0]
  return SPECIAL_CONTROLLED_ACCESS_ROWS.find(
    s => s.humId === humId && s.cellCount === cellCount && s.firstCellText === firstCellText,
  )
}

// === HumIds with Special Structure ===

export const HUM_IDS_WITH_DATA_SUMMARY = [
  "hum0031",
  "hum0043",
  "hum0235",
  "hum0250",
  "hum0395",
  "hum0396",
  "hum0397",
  "hum0398",
]

// === Criteria Normalization ===

export const CRITERIA_CANONICAL_MAP: Record<string, CriteriaCanonical> = {
  "制限公開(typei)": "Controlled-access (Type I)",
  "controlledaccess(typei)": "Controlled-access (Type I)",
  "制限公開(typeii)": "Controlled-access (Type II)",
  "controlledaccess(typeii)": "Controlled-access (Type II)",
  "非制限公開": "Unrestricted-access",
  "unrestrictedaccess": "Unrestricted-access",
}

// Japanese display values for criteria
export const CRITERIA_DISPLAY_JA: Record<CriteriaCanonical, string> = {
  "Controlled-access (Type I)": "制限公開 (Type I)",
  "Controlled-access (Type II)": "制限公開 (Type II)",
  "Unrestricted-access": "非制限公開",
}

export const getCriteriaDisplayValue = (
  criteria: CriteriaCanonical,
  lang: LangType,
): string => {
  if (lang === "ja") {
    return CRITERIA_DISPLAY_JA[criteria]
  }
  return criteria
}

// === Molecular Data Keys ===

export const MOL_DATA_UNUSED_KEY = "不要な項目のため削除する"

export const MOL_DATA_SPLIT_KEYS: Record<string, string[]> = {
  "Japanese Genotype-phenotype Archive Dataset AccessionとSequence Read Archive Accessionに分ける": [
    "Japanese Genotype-phenotype Archive Dataset Accession",
    "Sequence Read Archive Accession",
  ],
  "NBDC Dataset AccessionとJapanese Genotype-phenotype Archive Dataset Accessionに分ける": [
    "NBDC Dataset Accession",
    "Japanese Genotype-phenotype Archive Dataset Accession",
  ],
}

// === Publication Filtering ===

export const UNUSED_PUBLICATION_TITLES = [
  "In submission",
  "under publishing",
  "投稿中",
  "投稿準備中",
]

export const INVALID_DOI_VALUES = ["doi:", "In submission", "null"]

export const INVALID_PUBLICATION_DATASET_ID_PATTERNS: RegExp[] = [
  /genes/i,
  /panel/i,
  /遺伝子/,
  /^fastq$/i,
  /^\d+$/,
  /^reference$/i,
]

export const isInvalidPublicationDatasetId = (id: string): boolean => {
  const stripped = id.replace(/^\(|\)$/g, "")
  if (stripped === "") return true
  return INVALID_PUBLICATION_DATASET_ID_PATTERNS.some(pattern => pattern.test(stripped))
}

export const cleanPublicationDatasetId = (id: string): string => {
  // Only strip parentheses if they wrap the entire string (e.g., "(JGAD000001)" -> "JGAD000001")
  // Don't strip if parentheses are part of the content (e.g., "T2DM (JSNP)" stays unchanged)
  if (id.startsWith("(") && id.endsWith(")")) {
    return id.slice(1, -1)
  }
  return id
}

// === Grant ID Filtering ===

export const INVALID_GRANT_ID_VALUES = ["None", "null", "なし", "&nbsp;"]

// === Dataset ID Special Cases ===

export const DATASET_ID_SPECIAL_CASES: Record<string, string[]> = {
  "AP023461-AP024084": ["PRJDB10452"],
  "35 Dieases": ["35 Diseases"],  // typo fix (English)
  "35 Diseases": ["35 Diseases"],  // prevent split
  "35疾患": ["35疾患"],  // prevent split (Japanese)
  "hum0009v1.CpG.v1": ["hum0009.v1.CpG.v1"],  // typo fix (missing dot)
}

// === Dataset ID Mapping (Publications) ===

export const PUBLICATION_DATASET_ID_MAP: Record<string, string[]> = {
  "AP023461-AP024084": ["PRJDB10452"],
  "MTBK214": ["MTBKS214"],
  "DRA00908": ["DRA000908"],
  "DRA0017996": ["DRA017996"],
  "JGA0000012": ["JGAD000012"],
}

// Dataset IDs that should not be split by whitespace
export const PUBLICATION_DATASET_ID_NO_SPLIT: string[] = [
  "T2DM (JSNP)",
  "Osteoporosis (JSNP)",
]

// === Dataset ID Mapping (Controlled Access Users) ===

export const CONTROLLED_ACCESS_USERS_DATASET_ID_MAP: Record<string, string[]> = {
}

// === JGAX to JGAS Mapping (Experiment to Study) ===

export const JGAX_TO_JGAS_MAP: Record<string, string> = {
  "JGAX000007488": "JGAS000038",
  "JGAX000007522": "JGAS000038",
  "JGAX000007532": "JGAS000038",
  "JGAX000007538": "JGAS000038",
}

// Old JGA format to JGAS mapping (e.g., "JGAS000073（JGA000074）" -> JGA000074 maps to JGAS000073)
export const OLD_JGA_TO_JGAS_MAP: Record<string, string> = {
  "JGA000074": "JGAS000073",
  "JGA000117": "JGAS000107",
  "JGA000122": "JGAS000112",
}

// === ID Pattern Definitions ===

const SRA_REGEX = /(DRA|ERA|SRP|SRR|SRX|SRS)\d{6}/g
const JGAD_REGEX = /JGAD\d{6}/g
const JGAS_REGEX = /JGAS\d{6}/g
const GEA_REGEX = /E-GEAD-\d{3,4}/g
const NBDC_DATASET_REGEX = /hum\d{4}\.v\d+(?:\.[A-Za-z0-9_-]+)*\.v\d+/g
const BP_REGEX = /PRJDB\d{5}/g
const METABO_REGEX = /MTBKS\d{3}/g

export const ID_PATTERNS: Record<DatasetIdType, RegExp> = {
  DRA: SRA_REGEX,
  JGAD: JGAD_REGEX,
  JGAS: JGAS_REGEX,
  GEA: GEA_REGEX,
  NBDC_DATASET: NBDC_DATASET_REGEX,
  BP: BP_REGEX,
  METABO: METABO_REGEX,
}

export const ID_FIELDS = [
  "Dataset ID of the Processed data by JGA",
  "Genomic Expression Archive Accession",
  "Japanese Genotype-phenotype Archive Dataset Accession",
  "MetaboBank Accession",
  "NBDC Dataset Accession",
  "Sequence Read Archive Accession",
]

export const INVALID_ID_VALUES = ["E-GEAD-000"]

/**
 * Extract IDs by type from a text string
 */
export function extractIdsByType(text: string): Partial<Record<DatasetIdType, string[]>> {
  const result: Partial<Record<DatasetIdType, string[]>> = {}

  for (const [type, regex] of Object.entries(ID_PATTERNS) as [DatasetIdType, RegExp][]) {
    // Reset regex lastIndex for global patterns
    regex.lastIndex = 0
    const matches = text.match(new RegExp(regex.source, "g"))
    if (matches && matches.length > 0) {
      result[type] = matches
    }
  }

  return result
}

/**
 * Check if a string is a valid dataset ID (matches one of the known ID patterns)
 */
export const isValidDatasetId = (id: string): boolean => {
  for (const regex of Object.values(ID_PATTERNS)) {
    regex.lastIndex = 0
    if (regex.test(id)) {
      return true
    }
  }
  return false
}

/**
 * Apply special case transformation for dataset IDs
 */
export const applyDatasetIdSpecialCase = (id: string): string[] => {
  return DATASET_ID_SPECIAL_CASES[id] ?? [id]
}
