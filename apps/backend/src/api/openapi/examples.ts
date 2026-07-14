/**
 * OpenAPI request/response examples.
 *
 * Per-operation `example` values rendered in the "Try it out" panel and in the
 * static `schema.example` of the generated OpenAPI document. Concrete enough
 * for a reader to understand the wire shape without inventing data, abstract
 * enough that they're not coupled to any particular fixture in tests.
 *
 * Cross-cutting concepts (workflow, optimistic locking, search semantics) are
 * documented in apps/backend/docs/api-guide.md; examples here illustrate the
 * shape only.
 *
 * Constants are validated via `satisfies <Schema>` so that drift between an
 * example's literal shape and its target schema fails at compile time, while
 * the literal type itself stays narrow enough for editor autocompletion.
 *
 * Two BilingualTextValue helpers are exposed:
 *   - `bilingualText` produces `{ ja: { text, rawHtml: null }, en: ... }` for
 *     responses (full BilingualTextValue with `rawHtml`, mirroring stored ES
 *     documents).
 *   - `bilingualTextRequest` produces `{ ja: { text }, en: { text } }` for
 *     request bodies, matching the rawHtml-stripped request schemas (see
 *     api-guide.md §"rawHtml の扱い").
 */
import type {
  AllFacetsResponse,
  CreateDatasetForResearchRequest,
  CreateResearchRequest,
  CreateVersionRequest,
  DatasetBatchResponse,
  DatasetCreateResponse,
  DatasetDetailResponse,
  DatasetSearchBody,
  DatasetSearchResponse,
  DatasetUpdateResponse,
  DatasetVersionDetailResponse,
  DatasetVersionsListResponse,
  DsApplicationDetailResponse,
  DsApplicationListResponse,
  DuApplicationDetailResponse,
  DuApplicationListResponse,
  FacetFieldResponse,
  HealthResponse,
  IsAdminResponse,
  LinkedDatasetsListResponse,
  LinkedResearchesListResponse,
  ResearchBatchResponse,
  ResearchDetailResponse,
  ResearchSearchBody,
  ResearchSearchResponse,
  ResearchVersionsListResponse,
  ResearchWithLockResponse,
  StatsResponse,
  UpdateDatasetRequest,
  UpdateResearchRequest,
  VersionCreateResponse,
  VersionDetailResponse,
  WorkflowResponse,
} from "@/api/types"

// === Shared constants ===

const HUM_ID = "hum0001"
const HUM_VERSION_ID = "hum0001-v1"
const DATASET_ID = "JGAD000001"
const RESEARCH_VERSION = "v1"
const ISO_DATE = "2025-01-15"
const ISO_TIMESTAMP = "2025-01-15T08:00:00.000Z"
const REQUEST_ID = "req_01HZ4K2W3X7Y8Z9A0B1C2D3E4F"
const JDS_ID = "J-DS002494"
const JDU_ID = "J-DU006498"

const META_READ_ONLY = { requestId: REQUEST_ID, timestamp: ISO_TIMESTAMP }
const META_WITH_LOCK = { ...META_READ_ONLY, _seq_no: 12, _primary_term: 1 }
const META_PAGINATION_SINGLE = {
  ...META_READ_ONLY,
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
}

/** BilingualTextValue (response shape, with `rawHtml`).
 * `rawHtml` is `null` here — see "rawHtml の扱い" in apps/backend/docs/api-guide.md
 * for why API-created records always carry `null`.
 */
const bilingualText = (ja: string, en: string) => ({
  ja: { text: ja, rawHtml: null },
  en: { text: en, rawHtml: null },
})

/** BilingualTextValue (request shape, no `rawHtml` — clients never send it). */
const bilingualTextRequest = (ja: string, en: string) => ({
  ja: { text: ja },
  en: { text: en },
})

const urlValue = (text: string, url: string) => ({ text, url })

/** Bilingual title — Research title is the only field that stays as a
 * `{ ja, en }` map in responses (other text fields collapse to the selected
 * `lang`). Title values are plain strings here. */
const BILINGUAL_TITLE = {
  ja: "SCA31罹患患者のゲノム解析データ",
  en: "Sequence Data of a SCA31 Patient",
}

/** Plain bilingual `url` field on Research (not the summary `url`). */
const BILINGUAL_RESEARCH_URL = {
  ja: `https://humandbs.dbcls.jp/hum/${HUM_ID}`,
  en: `https://humandbs.dbcls.jp/en/hum/${HUM_ID}`,
}

/** Summary (response-shaped: BilingualTextValue includes `rawHtml`). */
const SAMPLE_SUMMARY_RESPONSE = {
  aims: bilingualText(
    "脊髄小脳変性症 31 型（SCA31）の原因遺伝子探索のためのゲノム解析",
    "Genome analysis for identifying the causative gene of SCA31",
  ),
  methods: bilingualText(
    "Illumina HiSeq による全エクソームシークエンス",
    "Whole-exome sequencing on Illumina HiSeq",
  ),
  targets: bilingualText("SCA31 罹患患者 1 名", "1 patient affected with SCA31"),
  url: {
    ja: [urlValue("HumanDBs Research page", "https://humandbs.dbcls.jp/hum/hum0001")],
    en: [urlValue("HumanDBs Research page", "https://humandbs.dbcls.jp/en/hum/hum0001")],
  },
}

/** Summary (request-shaped: BilingualTextValue without `rawHtml`). */
const SAMPLE_SUMMARY_REQUEST = {
  aims: bilingualTextRequest(
    "脊髄小脳変性症 31 型（SCA31）の原因遺伝子探索のためのゲノム解析",
    "Genome analysis for identifying the causative gene of SCA31",
  ),
  methods: bilingualTextRequest(
    "Illumina HiSeq による全エクソームシークエンス",
    "Whole-exome sequencing on Illumina HiSeq",
  ),
  targets: bilingualTextRequest("SCA31 罹患患者 1 名", "1 patient affected with SCA31"),
  url: {
    ja: [urlValue("HumanDBs Research page", "https://humandbs.dbcls.jp/hum/hum0001")],
    en: [urlValue("HumanDBs Research page", "https://humandbs.dbcls.jp/en/hum/hum0001")],
  },
}

/** summaryShort (request-shaped: BilingualTextValue without `rawHtml`).
 * Source: Joomla `/home` (ja) and `/en/home` (en) listings. */
const SAMPLE_SUMMARY_SHORT_REQUEST = {
  methods: bilingualTextRequest("配列決定", "Sequencing"),
  typeOfData: bilingualTextRequest("NGS（WGS）", "NGS (WGS)"),
  targets: bilingualTextRequest("SCA31：1 症例（日本人）", "1 SCA31 patient (Japanese)"),
}

/** dataProvider entry (response-shaped Person). PersonSchema's
 * `name`/`organization.name` are BilingualTextValue, hence `bilingualText`. */
const DATA_PROVIDER_RESPONSE = {
  name: bilingualText("山田 太郎", "Yamada Taro"),
  email: "yamada@example.org",
  orcid: "0000-0001-2345-6789",
  organization: {
    name: bilingualText(
      "東京大学医科学研究所",
      "Institute of Medical Science, The University of Tokyo",
    ),
    address: { country: "JP" },
  },
}

/** dataProvider entry (request-shaped — rawHtml stripped). */
const DATA_PROVIDER_REQUEST = {
  name: bilingualTextRequest("山田 太郎", "Yamada Taro"),
  email: "yamada@example.org",
  orcid: "0000-0001-2345-6789",
  organization: {
    name: bilingualTextRequest(
      "東京大学医科学研究所",
      "Institute of Medical Science, The University of Tokyo",
    ),
    address: { country: "JP" },
  },
}

/** controlledAccessUser entry (response-shaped). Adds the trailing fields
 * the dataProvider variant omits — these are populated for users who actually
 * received access to a dataset. */
const CONTROLLED_ACCESS_USER_RESPONSE = {
  ...DATA_PROVIDER_RESPONSE,
  name: bilingualText("佐藤 次郎", "Sato Jiro"),
  email: "sato@example.org",
  orcid: "0000-0002-3456-7890",
  datasetIds: [DATASET_ID],
  researchTitle: BILINGUAL_TITLE,
  periodOfDataUse: { startDate: "2025-04-01", endDate: "2027-03-31" },
}

const RESEARCH_PROJECT_RESPONSE = {
  name: bilingualText(
    "AMED 脳とこころの研究推進プログラム",
    "AMED Brain/MINDS Beyond Program",
  ),
  url: {
    ja: urlValue("AMED 公式ページ", "https://www.amed.go.jp/"),
    en: urlValue("AMED Official", "https://www.amed.go.jp/en/"),
  },
}

const RESEARCH_PROJECT_REQUEST = {
  name: bilingualTextRequest(
    "AMED 脳とこころの研究推進プログラム",
    "AMED Brain/MINDS Beyond Program",
  ),
  url: {
    ja: urlValue("AMED 公式ページ", "https://www.amed.go.jp/"),
    en: urlValue("AMED Official", "https://www.amed.go.jp/en/"),
  },
}

/** Grant (BilingualText only — same shape for request and response). */
const SAMPLE_GRANT = {
  id: ["JP21wm0425001"],
  title: {
    ja: "脊髄小脳変性症 31 型の発症機序解明",
    en: "Elucidation of pathogenesis of SCA31",
  },
  agency: { name: { ja: "AMED", en: "AMED" } },
}

/** Publication (BilingualText only — same shape for request and response). */
const SAMPLE_PUBLICATION = {
  title: {
    ja: "SCA31 のゲノム解析",
    en: "Genome analysis of SCA31",
  },
  doi: "10.1000/example.001",
  datasetIds: [DATASET_ID],
}

// === Simple responses ===

export const exampleHealthResponse: HealthResponse = {
  status: "ok",
  timestamp: ISO_TIMESTAMP,
}

export const exampleIsAdminSingleResponse = {
  data: { isAdmin: true } satisfies IsAdminResponse,
  meta: META_READ_ONLY,
}

export const exampleStatsSingleResponse = {
  data: {
    research: { total: 42 },
    dataset: { total: 138 },
    facets: {
      criteria: {
        "Controlled-access (Type I)": { research: 30, dataset: 100 },
        "Controlled-access (Type II)": { research: 8, dataset: 28 },
        "Unrestricted-access": { research: 4, dataset: 10 },
      },
    },
  } satisfies StatsResponse,
  meta: META_READ_ONLY,
}

// === Research workflow ===

/** Default `WorkflowResponse` example (kept as `status: "review"` for the
 * submit transition). Per-action examples below illustrate the actual target
 * status of approve / reject / unpublish. */
export const exampleWorkflowResponse: WorkflowResponse = {
  data: { humId: HUM_ID, status: "review", dateModified: ISO_TIMESTAMP },
  meta: META_WITH_LOCK,
}

/** Submit transition: draft -> review. */
export const exampleSubmitResearchResponse: WorkflowResponse = {
  data: { humId: HUM_ID, status: "review", dateModified: ISO_TIMESTAMP },
  meta: META_WITH_LOCK,
}

/** Approve transition: review -> published. */
export const exampleApproveResearchResponse: WorkflowResponse = {
  data: { humId: HUM_ID, status: "published", dateModified: ISO_TIMESTAMP },
  meta: META_WITH_LOCK,
}

/** Reject transition: review -> draft. */
export const exampleRejectResearchResponse: WorkflowResponse = {
  data: { humId: HUM_ID, status: "draft", dateModified: ISO_TIMESTAMP },
  meta: META_WITH_LOCK,
}

/** Unpublish transition: published -> draft. */
export const exampleUnpublishResearchResponse: WorkflowResponse = {
  data: { humId: HUM_ID, status: "draft", dateModified: ISO_TIMESTAMP },
  meta: META_WITH_LOCK,
}

// === Research request / response ===

export const exampleCreateResearchRequest = {
  title: BILINGUAL_TITLE,
  summary: SAMPLE_SUMMARY_REQUEST,
  dataProvider: [DATA_PROVIDER_REQUEST],
  researchProject: [RESEARCH_PROJECT_REQUEST],
  grant: [SAMPLE_GRANT],
  relatedPublication: [SAMPLE_PUBLICATION],
  summaryShort: SAMPLE_SUMMARY_SHORT_REQUEST,
  humId: HUM_ID,
} satisfies CreateResearchRequest

export const exampleUpdateResearchRequest = {
  title: BILINGUAL_TITLE,
  summary: SAMPLE_SUMMARY_REQUEST,
  dataProvider: [DATA_PROVIDER_REQUEST],
  researchProject: [RESEARCH_PROJECT_REQUEST],
  grant: [SAMPLE_GRANT],
  relatedPublication: [SAMPLE_PUBLICATION],
  summaryShort: SAMPLE_SUMMARY_SHORT_REQUEST,
  _seq_no: 12,
  _primary_term: 1,
} satisfies UpdateResearchRequest

/** Common Research fields for any response built on `ResearchSchema`. */
const RESEARCH_BASE = {
  humId: HUM_ID,
  url: BILINGUAL_RESEARCH_URL,
  title: BILINGUAL_TITLE,
  summary: SAMPLE_SUMMARY_RESPONSE,
  dataProvider: [DATA_PROVIDER_RESPONSE],
  researchProject: [RESEARCH_PROJECT_RESPONSE],
  grant: [SAMPLE_GRANT],
  relatedPublication: [SAMPLE_PUBLICATION],
  controlledAccessUser: [CONTROLLED_ACCESS_USER_RESPONSE],
  latestVersion: RESEARCH_VERSION,
  datePublished: ISO_TIMESTAMP,
  dateModified: ISO_TIMESTAMP,
  status: "published" as const,
  owners: ["sample-user"],
  summaryShort: {
    methods: bilingualText("配列決定", "Sequencing"),
    typeOfData: bilingualText("NGS（WGS）", "NGS (WGS)"),
    targets: bilingualText("SCA31：1 症例（日本人）", "1 SCA31 patient (Japanese)"),
  },
}

/** Single Experiment record for sample Datasets. `data` values are
 * BilingualTextValue (response shape), keyed by free-form metadata names. */
const SAMPLE_EXPERIMENT = {
  header: bilingualText("サンプル 1", "Sample 1"),
  data: {
    assayType: bilingualText("WGS", "WGS"),
    platform: bilingualText("Illumina HiSeq", "Illumina HiSeq"),
  },
}

/** Dataset body conforming to `EsDatasetSchema` (which extends `DatasetSchema`).
 * `originalMetadata` is omitted (optional) since it is debug/audit data. */
const DATASET_BODY = {
  datasetId: DATASET_ID,
  version: "v1",
  versionReleaseDate: ISO_DATE,
  humId: HUM_ID,
  humVersionId: HUM_VERSION_ID,
  releaseDate: ISO_DATE,
  criteria: "Controlled-access (Type I)" as const,
  typeOfData: { ja: "WGS データ", en: "WGS data" },
  experiments: [SAMPLE_EXPERIMENT],
}

/** Dataset-level merged searchable aggregate
 * (`MergedSearchableSchema` in views.ts). Surfaced by detail and version-detail
 * Dataset endpoints. Values aggregate per-experiment searchable fields. */
const SAMPLE_MERGED_SEARCHABLE = {
  subjectCount: 1,
  subjectCountType: ["individual"],
  healthStatus: ["affected"],
  diseases: [{ label: "SCA31", icd10: "G11.1" }],
  tissues: ["Blood"],
  isTumor: ["normal" as const],
  cellLine: [],
  population: ["Japanese"],
  cohorts: ["BioBank Japan"],
  sex: ["male"],
  ageGroup: ["adult"],
  assayType: ["WGS"],
  libraryKits: [],
  platforms: [{ vendor: "Illumina", model: "HiSeq" }],
  readType: ["paired-end"],
  readLength: 150,
  sequencingDepth: 30,
  targetCoverage: null,
  referenceGenome: ["GRCh38"],
  targets: [],
  variantCounts: { snv: 4500000, indel: 600000, cnv: 1500, sv: 8000, total: 5109500 },
  hasPhenotypeData: true,
  fileTypes: ["FASTQ", "BAM", "VCF"],
  processedDataTypes: ["aligned reads", "variant calls"],
  dataVolumeGb: 120,
  policies: [],
}

/** Dataset body with `mergedSearchable` for endpoints that surface
 * `DatasetDocWithMergedSchema` (Dataset detail / version detail / batch).
 * `parentJgaStudyId` is required-nullable — the field itself is always present,
 * populated live from DDBJ Search for JGAD datasets. */
const DATASET_BODY_WITH_MERGED = {
  ...DATASET_BODY,
  mergedSearchable: SAMPLE_MERGED_SEARCHABLE,
  parentJgaStudyId: "JGAS000001",
}

/** Detail body for `ResearchDetailResponse` (`ResearchDetailSchema` =
 * `EsResearchSchema.omit({versionIds}).extend(researchVersionFields)`).
 * Omits `versionIds`, includes per-version fields and `draftVersion`. */
const RESEARCH_DETAIL_BODY = {
  ...RESEARCH_BASE,
  draftVersion: null,
  // researchVersionFields
  humVersionId: HUM_VERSION_ID,
  version: RESEARCH_VERSION,
  versionReleaseDate: ISO_DATE,
  releaseNote: bilingualText("初版リリース", "Initial release"),
  datasets: [DATASET_BODY],
}

/** Body for `ResearchWithLockResponse` (`ResearchResponseSchema` =
 * `ResearchWithStatusSchema.extend({datasets: optional})`).
 * Includes `versionIds` (kept on `ResearchSchema`); has no `draftVersion` or
 * per-version fields. */
const RESEARCH_LOCK_BODY = {
  ...RESEARCH_BASE,
  versionIds: [HUM_VERSION_ID],
  datasets: [DATASET_BODY],
}

export const exampleResearchDetailResponse = {
  data: RESEARCH_DETAIL_BODY,
  meta: META_WITH_LOCK,
} satisfies ResearchDetailResponse

/** Batch-get response: one humId retrieved, one not found/inaccessible. */
export const exampleResearchBatchResponse = {
  data: [RESEARCH_DETAIL_BODY],
  meta: {
    ...META_READ_ONLY,
    batch: { requested: 2, found: 1, notFound: ["hum0002"] },
  },
} satisfies ResearchBatchResponse

export const exampleResearchWithLockResponse = {
  data: RESEARCH_LOCK_BODY,
  meta: META_WITH_LOCK,
} satisfies ResearchWithLockResponse

/** Research summary for list/search responses (`ResearchSummarySchema`).
 * Multi-line text fields collapse to the requested `lang` (plain strings). */
const RESEARCH_SUMMARY_ITEM = {
  humId: HUM_ID,
  lang: "ja" as const,
  title: BILINGUAL_TITLE,
  versions: [{ version: RESEARCH_VERSION, releaseDate: ISO_DATE }],
  methods: SAMPLE_SUMMARY_RESPONSE.methods.ja.text,
  datasetIds: [DATASET_ID],
  typeOfData: ["WGS データ"],
  platforms: ["Illumina HiSeq"],
  targets: SAMPLE_SUMMARY_RESPONSE.targets.ja.text,
  methodsSummary: { ja: "配列決定", en: "Sequencing" },
  typeOfDataSummary: { ja: "NGS（WGS）", en: "NGS (WGS)" },
  targetsSummary: { ja: "SCA31：1 症例（日本人）", en: "1 SCA31 patient (Japanese)" },
  dataProvider: [DATA_PROVIDER_RESPONSE.name.ja.text],
  criteria: ["Controlled-access (Type I)" as const],
  status: "published" as const,
}

export const exampleResearchSearchResponse = {
  data: [RESEARCH_SUMMARY_ITEM],
  meta: META_PAGINATION_SINGLE,
  facets: {},
} satisfies ResearchSearchResponse

// === Research versions ===

/** Version item for `ResearchVersionsListResponse` (`ResearchVersionSchema`).
 * `datasets` is `DatasetRef[]` here — only `{datasetId, version}` is allowed. */
const RESEARCH_VERSION_LIST_ITEM_V1 = {
  humId: HUM_ID,
  humVersionId: HUM_VERSION_ID,
  version: RESEARCH_VERSION,
  versionReleaseDate: ISO_DATE,
  datasets: [{ datasetId: DATASET_ID, version: "v1" }],
  releaseNote: bilingualText("初版リリース", "Initial release"),
}

const RESEARCH_VERSION_LIST_ITEM_V2 = {
  humId: HUM_ID,
  humVersionId: "hum0001-v2",
  version: "v2",
  versionReleaseDate: "2025-06-01",
  datasets: [{ datasetId: DATASET_ID, version: "v2" }],
  releaseNote: bilingualText("実験データ追加", "Added new experiments"),
}

/** Version item for `VersionDetailResponse` / `VersionCreateResponse`
 * (`VersionResponseSchema` = `ResearchVersionSchema.extend({datasets: ApiDataset[]})`).
 * `datasets` here is the embedded full Dataset shape. */
const RESEARCH_VERSION_DETAIL_ITEM = {
  ...RESEARCH_VERSION_LIST_ITEM_V1,
  datasets: [DATASET_BODY],
}

export const exampleResearchVersionsListResponse = {
  data: [RESEARCH_VERSION_LIST_ITEM_V2, RESEARCH_VERSION_LIST_ITEM_V1],
  meta: {
    ...META_READ_ONLY,
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
  },
} satisfies ResearchVersionsListResponse

export const exampleVersionDetailResponse = {
  data: RESEARCH_VERSION_DETAIL_ITEM,
  meta: META_READ_ONLY,
} satisfies VersionDetailResponse

export const exampleVersionCreateResponse = {
  data: RESEARCH_VERSION_DETAIL_ITEM,
  meta: META_WITH_LOCK,
} satisfies VersionCreateResponse

export const exampleCreateVersionRequest: CreateVersionRequest = {
  releaseNote: bilingualTextRequest("誤記修正", "Typo fix"),
}

// === Dataset request / response ===

/** Single Experiment for request bodies — uses the rawHtml-stripped helper. */
const SAMPLE_EXPERIMENT_REQUEST = {
  header: bilingualTextRequest("サンプル 1", "Sample 1"),
  data: {
    assayType: bilingualTextRequest("WGS", "WGS"),
    platform: bilingualTextRequest("Illumina HiSeq", "Illumina HiSeq"),
  },
}

export const exampleCreateDatasetForResearchRequest = {
  releaseDate: ISO_DATE,
  criteria: "Controlled-access (Type I)",
  typeOfData: { ja: "WGS データ", en: "WGS data" },
  experiments: [SAMPLE_EXPERIMENT_REQUEST],
} satisfies CreateDatasetForResearchRequest

export const exampleUpdateDatasetRequest = {
  releaseDate: ISO_DATE,
  criteria: "Controlled-access (Type I)",
  typeOfData: { ja: "WGS データ", en: "WGS data" },
  experiments: [SAMPLE_EXPERIMENT_REQUEST],
  _seq_no: 12,
  _primary_term: 1,
} satisfies UpdateDatasetRequest

export const exampleDatasetDetailResponse = {
  data: DATASET_BODY_WITH_MERGED,
  meta: META_WITH_LOCK,
} satisfies DatasetDetailResponse

/** Batch-get response: one datasetId retrieved, one not found/inaccessible. */
export const exampleDatasetBatchResponse = {
  data: [DATASET_BODY_WITH_MERGED],
  meta: {
    ...META_READ_ONLY,
    batch: { requested: 2, found: 1, notFound: ["JGAD000002"] },
  },
} satisfies DatasetBatchResponse

export const exampleDatasetUpdateResponse = {
  data: DATASET_BODY,
  meta: META_WITH_LOCK,
} satisfies DatasetUpdateResponse

export const exampleDatasetCreateResponse = {
  data: DATASET_BODY,
  meta: META_WITH_LOCK,
} satisfies DatasetCreateResponse

export const exampleDatasetSearchResponse = {
  data: [DATASET_BODY],
  meta: META_PAGINATION_SINGLE,
  facets: {},
} satisfies DatasetSearchResponse

/** Dataset version list item (`DatasetVersionItemSchema`).
 * Schema does not include `datasetId` — see views.ts. */
const DATASET_VERSION_LIST_ITEM = {
  version: "v1",
  typeOfData: { ja: "WGS データ", en: "WGS data" },
  criteria: "Controlled-access (Type I)",
  releaseDate: ISO_DATE,
}

export const exampleDatasetVersionsListResponse = {
  data: [DATASET_VERSION_LIST_ITEM],
  meta: META_PAGINATION_SINGLE,
} satisfies DatasetVersionsListResponse

export const exampleDatasetVersionDetailResponse = {
  data: DATASET_BODY_WITH_MERGED,
  meta: META_READ_ONLY,
} satisfies DatasetVersionDetailResponse

// === Linked listing responses ===

export const exampleLinkedDatasetsListResponse = {
  data: [DATASET_BODY],
  meta: META_PAGINATION_SINGLE,
} satisfies LinkedDatasetsListResponse

/** `LinkedResearchesListResponse` is a list of `ResearchDetailSchema`. The
 * detail-endpoint response omits `_seq_no`/`_primary_term` (surfaced in
 * `meta`), but here each item is the full schema, so the lock fields stay on
 * the data side. */
const RESEARCH_DETAIL_WITH_LOCK_BODY = {
  ...RESEARCH_DETAIL_BODY,
  _seq_no: 12,
  _primary_term: 1,
}

export const exampleLinkedResearchesListResponse = {
  data: [RESEARCH_DETAIL_WITH_LOCK_BODY],
  meta: META_PAGINATION_SINGLE,
} satisfies LinkedResearchesListResponse

// === Search request bodies ===

export const exampleResearchSearchBody = {
  query: "cancer",
  page: 1,
  limit: 20,
  lang: "ja",
  order: "desc",
  includeFacets: true,
  status: "published",
  datasetFilters: {
    assayType: ["WGS"],
    tissues: ["Blood"],
  },
} satisfies ResearchSearchBody

export const exampleDatasetSearchBody = {
  query: "cancer",
  page: 1,
  limit: 20,
  lang: "ja",
  order: "desc",
  includeFacets: true,
  filters: {
    assayType: ["WGS"],
    tissues: ["Blood"],
  },
} satisfies DatasetSearchBody

// === Facets ===

export const exampleAllFacetsResponse = {
  data: {
    criteria: [
      { value: "Controlled-access (Type I)", count: 100 },
      { value: "Unrestricted-access", count: 10 },
    ],
    assayType: [
      { value: "WGS", count: 50 },
      { value: "WES", count: 30 },
    ],
  } satisfies AllFacetsResponse,
  meta: META_READ_ONLY,
}

export const exampleFacetFieldResponse = {
  data: {
    fieldName: "criteria",
    values: [
      { value: "Controlled-access (Type I)", count: 100 },
      { value: "Unrestricted-access", count: 10 },
    ],
  } satisfies FacetFieldResponse,
  meta: META_READ_ONLY,
}

// === JGA Shinsei ===

/** Common JGA bilingual text — schema is plain `{ ja: string|null, en: string|null }`. */
const JGA_BILINGUAL = (ja: string | null, en: string | null) => ({ ja, en })

const JGA_HEAD = {
  name: "機関長 太郎",
  job: "機関長",
  phone: "+81-3-0000-0000",
  email: "head@example.org",
}

const JGA_PI = {
  accountId: "acct-001",
  firstName: JGA_BILINGUAL("一郎", "Ichiro"),
  middleName: JGA_BILINGUAL(null, null),
  lastName: JGA_BILINGUAL("山田", "Yamada"),
  institution: JGA_BILINGUAL("東京大学医科学研究所", "IMSUT"),
  division: JGA_BILINGUAL("ゲノム解析部門", "Genome Analysis"),
  job: JGA_BILINGUAL("教授", "Professor"),
  phone: "+81-3-0000-0000",
  email: "yamada@example.org",
  address: {
    country: "JP",
    postalCode: "108-8639",
    prefecture: "東京都",
    city: "港区",
    street: "白金台 4-6-1",
  },
}

/** Submitter has the invariant that `institution`, `division`, and
 * `middleName` always have `ja: null` (English-only). See
 * apps/backend/jga-shinsei/docs/output-schema.md. */
const JGA_SUBMITTER = {
  ...JGA_PI,
  middleName: JGA_BILINGUAL(null, null),
  institution: JGA_BILINGUAL(null, "IMSUT"),
  division: JGA_BILINGUAL(null, "Genome Analysis"),
}

const JGA_COLLABORATOR = {
  name: "佐藤 花子",
  division: "ゲノム解析部門",
  job: "助教",
  eradid: "00000001",
  orcid: "0000-0001-1111-2222",
  seminar: "yes" as const,
}

const JGA_UPLOADED_FILE = {
  file: "ethics_review.pdf",
  type: "ethics_review",
}

const JGA_CONTROL = {
  lang: "ja" as const,
  groupId: "grp-001",
  isNoneCollaborator: false,
  privateComment: null,
  isDeclareStatement: true,
  isAgreeMailUse: true,
}

/** J-DS application body (`DsApplicationTransformedSchema`). */
const DS_APPLICATION_BODY = {
  jdsId: `${JDS_ID}-001`,
  status: 60 as const,
  statusLabel: JGA_BILINGUAL("申請承認", "Approved"),
  jsubIds: ["JSUB000001"],
  humIds: [HUM_ID],
  jgaIds: ["JGAS000001"],
  studyTitle: JGA_BILINGUAL("SCA31 ゲノム解析研究", "Genome analysis of SCA31"),
  aim: JGA_BILINGUAL("SCA31 の原因遺伝子の同定", "Identify the causative gene of SCA31"),
  method: JGA_BILINGUAL("全エクソームシークエンス", "Whole-exome sequencing"),
  participant: JGA_BILINGUAL("罹患患者 1 名", "1 affected patient"),
  restriction: JGA_BILINGUAL("学術研究目的のみ", "Academic research only"),
  publication: "Yamada et al. (2025)",
  icd10: "G11.1",
  data: [
    {
      dataAccess: "submission_type1" as const,
      studyType: "case_control",
      studyTypeOther: null,
      target: "germline",
      fileFormat: "FASTQ",
      fileSize: "100GB",
    },
  ],
  releaseDate: ISO_DATE,
  deIdentification: {
    status: "completed",
    date: ISO_DATE,
    reason: null,
  },
  review: {
    submissionStatus: "approved" as const,
    submissionDate: ISO_DATE,
    companyUseStatus: "no" as const,
    multicenterCollaborativeStudyStatus: "no" as const,
    nbdcDataProcessingStatus: "approved" as const,
    nbdcDataProcessingReason: null,
    nbdcGuidelineStatus: "yes" as const,
    isSimplifiedReview: false,
  },
  head: JGA_HEAD,
  pi: JGA_PI,
  submitter: JGA_SUBMITTER,
  collaborators: [JGA_COLLABORATOR],
  uploadedFiles: [JGA_UPLOADED_FILE],
  control: JGA_CONTROL,
  submitDate: ISO_DATE,
  createDate: ISO_DATE,
}

/** J-DU application body (`DuApplicationTransformedSchema`). */
const DU_APPLICATION_BODY = {
  jduId: `${JDU_ID}-001`,
  status: 60 as const,
  statusLabel: JGA_BILINGUAL("申請承認", "Approved"),
  jgadIds: [DATASET_ID],
  jgasIds: ["JGAS000001"],
  humIds: [HUM_ID],
  studyTitle: JGA_BILINGUAL("SCA31 二次解析", "Secondary analysis of SCA31"),
  usePurpose: "二次解析による遺伝子発現変動の検出",
  useSummary: "公開データを用いた二次解析",
  usePublication: "Sato et al. (2025)",
  useDatasets: [
    { request: "raw FASTQ", purpose: "alignment", id: DATASET_ID },
  ],
  usePeriod: { start: ISO_DATE, end: "2027-03-31" },
  useReview: { status: "completed" as const, date: ISO_DATE },
  server: {
    status: "onpre" as const,
    offPremiseStatus: [],
    isOffPremiseStatement: false,
    acknowledgmentStatus: "yes" as const,
  },
  publicKey: {
    file: "id_rsa.pub",
    txt: "ssh-rsa AAAA...",
    key: "AAAA...",
  },
  report: {
    summary: "中間解析完了",
    publication: "Sato et al. (2025)",
    intellectualProperty: null,
    nbdcSharingGuidelineStatus: "yes" as const,
    nbdcSharingGuidelineDetail: null,
    newReportStatus: "submitted" as const,
  },
  deletion: {
    date: null,
    keepSecondaryDataStatus: "yes" as const,
    keepSecondaryDataDetail: "解析結果のみ保持",
  },
  distribution: {
    status: "no" as const,
    detail: null,
    way: null,
    isStatement1: true,
    isStatement2: true,
  },
  members: [
    {
      accountId: "acct-002",
      firstName: JGA_BILINGUAL("花子", "Hanako"),
      middleName: JGA_BILINGUAL(null, null),
      lastName: JGA_BILINGUAL("佐藤", "Sato"),
      email: "sato@example.org",
      institution: JGA_BILINGUAL("東京大学", "The University of Tokyo"),
      division: JGA_BILINGUAL("バイオインフォ", "Bioinformatics"),
      job: JGA_BILINGUAL("助教", "Assistant Professor"),
      eradid: "00000002",
      orcid: "0000-0002-2222-3333",
    },
  ],
  head: JGA_HEAD,
  pi: JGA_PI,
  submitter: JGA_SUBMITTER,
  collaborators: [JGA_COLLABORATOR],
  uploadedFiles: [JGA_UPLOADED_FILE],
  control: JGA_CONTROL,
  submitDate: ISO_DATE,
  createDate: ISO_DATE,
}

export const exampleDsApplicationListResponse = {
  data: [DS_APPLICATION_BODY],
  meta: META_PAGINATION_SINGLE,
} satisfies DsApplicationListResponse

export const exampleDsApplicationDetailResponse = {
  data: DS_APPLICATION_BODY,
  meta: META_READ_ONLY,
} satisfies DsApplicationDetailResponse

export const exampleDuApplicationListResponse = {
  data: [DU_APPLICATION_BODY],
  meta: META_PAGINATION_SINGLE,
} satisfies DuApplicationListResponse

export const exampleDuApplicationDetailResponse = {
  data: DU_APPLICATION_BODY,
  meta: META_READ_ONLY,
} satisfies DuApplicationDetailResponse
