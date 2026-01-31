import { Client, HttpConnection } from "@elastic/elasticsearch"
import type { estypes } from "@elastic/elasticsearch"

import {
  nestedTermsQuery,
  nestedWildcardQuery,
  nestedExistsQuery,
  nestedRangeQuery,
  doubleNestedWildcardQuery,
  doubleNestedTermsQuery,
  nestedBooleanTermQuery,
} from "@/api/es-query-helpers"
import type {
  DatasetSearchQuery,
  DatasetSearchResponse,
  ResearchSearchQuery,
  ResearchSearchResponse,
  FacetsMap,
  EsDatasetDoc,
  EsResearchDoc,
  EsResearchVersionDoc,
  EsResearchDetail,
  ResearchSummary,
  DatasetVersionItem,
  AuthUser,
} from "@/api/types"
import {
  EsDatasetDocSchema,
  EsResearchDocSchema,
  EsResearchVersionDocSchema,
  EsResearchDetailSchema,
} from "@/api/types"

const ES_INDEX = {
  research: "research",
  researchVersion: "research-version",
  dataset: "dataset",
}

const ES_HOST = process.env.HUMANDBS_ES_HOST ?? "http://humandbs-elasticsearch-dev:9200"

const createEsClient = () => {
  const esClient = new Client({
    node: ES_HOST,
    Connection: HttpConnection,
  })

  return esClient
}

const esClient = createEsClient()

// === Authorization Filters ===

/**
 * Build Elasticsearch filter based on user authorization level
 *
 * - public (authUser=null): Only `status=published`
 * - auth (authUser!=null, !isAdmin): `status=published` OR `uids` contains userId
 * - admin: No filter (can see all)
 */
export const buildStatusFilter = (authUser: AuthUser | null): estypes.QueryDslQueryContainer | null => {
  if (authUser?.isAdmin) {
    // Admin can see everything
    return null
  }

  if (authUser) {
    // Authenticated user: published OR own resources (userId in uids)
    return {
      bool: {
        should: [
          { term: { status: "published" } },
          { term: { uids: authUser.userId } },
        ],
        minimum_should_match: 1,
      },
    }
  }

  // Public: only published
  return { term: { status: "published" } }
}

/**
 * Check if user can access a specific Research based on status and uids
 */
export const canAccessResearchDoc = (
  authUser: AuthUser | null,
  researchDoc: EsResearchDoc,
): boolean => {
  if (authUser?.isAdmin) return true
  if (researchDoc.status === "published") return true
  if (authUser && researchDoc.uids.includes(authUser.userId)) return true
  return false
}

/**
 * Get humIds of published Research for Dataset filtering
 * Used when Dataset visibility depends on parent Research status
 */
export const getPublishedHumIds = async (authUser: AuthUser | null): Promise<string[] | null> => {
  if (authUser?.isAdmin) {
    // Admin can see all datasets
    return null
  }

  const statusFilter = buildStatusFilter(authUser)
  if (!statusFilter) return null

  interface HumIdAggs {
    humIds: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>
  }

  const res = await esClient.search<unknown, HumIdAggs>({
    index: ES_INDEX.research,
    size: 0,
    query: statusFilter,
    aggs: {
      humIds: { terms: { field: "humId", size: 10000 } },
    },
  })

  const buckets = res.aggregations?.humIds?.buckets
  if (!Array.isArray(buckets)) return []
  return buckets.map(b => b.key)
}

// === utils ===

const esTotal = (t: number | { value: number } | undefined) => {
  return typeof t === "number" ? t : t?.value ?? 0
}

const uniq = <T>(arr: T[]): T[] => {
  return Array.from(new Set(arr))
}

const mgetMap = async <T>(
  index: string,
  ids: string[],
  parse: (doc: unknown) => T,
): Promise<Map<string, T>> => {
  if (ids.length === 0) return new Map()
  const { docs } = await esClient.mget<T>({
    index,
    body: { ids: uniq(ids) },
  })
  const m = new Map<string, T>()
  for (const doc of docs as { found?: boolean; _id?: string; _source?: unknown }[]) {
    if (doc.found && doc._id && doc._source) {
      m.set(doc._id, parse(doc._source))
    }
  }
  return m
}

// === API Functions ===

export const getResearchDoc = async (
  humId: string,
): Promise<EsResearchDoc | null> => {
  const id = humId // lang suffix removed (BilingualText format)
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id,
  }, { ignore: [404] })
  return res.found && res._source ? EsResearchDocSchema.parse(res._source) : null
}

export const getResearchVersion = async (
  humId: string,
  { version }: { version?: string },
): Promise<EsResearchVersionDoc | null> => {
  if (version) {
    const id = `${humId}-${version}` // lang suffix removed (BilingualText format)
    const res = await esClient.get<EsResearchVersionDoc>({
      index: ES_INDEX.researchVersion,
      id,
    }, { ignore: [404] })
    return res.found && res._source ? EsResearchVersionDocSchema.parse(res._source) : null
  }

  // If the version is not specified, get the latest version
  const { hits } = await esClient.search<EsResearchVersionDoc>({
    index: ES_INDEX.researchVersion,
    size: 1,
    query: { term: { humId } },
    sort: [
      { version: { order: "desc" } },
      { versionReleaseDate: { order: "desc" } },
    ],
    _source: true,
    track_total_hits: false,
  })
  const hit = hits.hits[0]
  return hit && hit._source ? EsResearchVersionDocSchema.parse(hit._source) : null
}

export const getResearchDetail = async (
  humId: string,
  { version }: { version?: string },
  authUser: AuthUser | null = null,
): Promise<EsResearchDetail | null> => {
  const [researchDoc, researchVersionDoc] = await Promise.all([
    getResearchDoc(humId),
    getResearchVersion(humId, { version }),
  ])
  if (!researchDoc || !researchVersionDoc) return null

  // Authorization check: verify user can access this Research
  if (!canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to hide existence from unauthorized users
  }

  // datasets is now { datasetId, version }[]
  const dsRefs = researchVersionDoc.datasets
  const dsIds = dsRefs.map(ref => `${ref.datasetId}-${ref.version}`)
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, EsDatasetDocSchema.parse)
  const datasets = dsIds.map(id => dsMap.get(id)).filter((x): x is EsDatasetDoc => !!x)

  const { versionIds: _versionIds, ...researchDocRest } = researchDoc

  return EsResearchDetailSchema.parse({
    ...researchDocRest,
    humVersionId: researchVersionDoc.humVersionId,
    version: researchVersionDoc.version,
    versionReleaseDate: researchVersionDoc.versionReleaseDate,
    releaseNote: researchVersionDoc.releaseNote,
    datasets,
  })
}

export const listResearchVersions = async (
  humId: string,
  authUser: AuthUser | null = null,
): Promise<EsResearchVersionDoc[] | null> => {
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id: humId, // lang suffix removed (BilingualText format)
  }, { ignore: [404] })
  if (!res.found || !res._source) return null
  const researchDoc = EsResearchDocSchema.parse(res._source)

  // Authorization check: verify user can access this Research
  if (!canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to hide existence from unauthorized users
  }

  const rvIds = researchDoc.versionIds ?? []
  if (rvIds.length === 0) return []
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, EsResearchVersionDocSchema.parse)

  return rvIds
    .map((id: string) => rvMap.get(id))
    .filter((x): x is EsResearchVersionDoc => !!x)
}

export const listResearchVersionsSorted = async (
  humId: string,
  authUser: AuthUser | null = null,
): Promise<EsResearchVersionDoc[] | null> => {
  const rows = await listResearchVersions(humId, authUser)
  if (!rows) return null
  const verNum = (v: string) => Number(/^v(\d+)$/.exec(v)?.[1] ?? -1)
  rows.sort((a, b) => verNum(b.version) - verNum(a.version))
  return rows
}

/**
 * Check if user can access a Dataset based on parent Research status
 */
const canAccessDataset = async (
  authUser: AuthUser | null,
  dataset: EsDatasetDoc,
): Promise<boolean> => {
  if (authUser?.isAdmin) return true

  // Get parent Research and check access
  const researchDoc = await getResearchDoc(dataset.humId)
  if (!researchDoc) return false

  return canAccessResearchDoc(authUser, researchDoc)
}

export const getDataset = async (
  datasetId: string,
  { version }: { version?: string },
  authUser: AuthUser | null = null,
): Promise<EsDatasetDoc | null> => {
  let dataset: EsDatasetDoc | null = null

  if (version) {
    const id = `${datasetId}-${version}` // lang suffix removed (BilingualText format)
    const res = await esClient.get<EsDatasetDoc>({
      index: ES_INDEX.dataset,
      id,
    }, { ignore: [404] })
    dataset = res.found && res._source ? EsDatasetDocSchema.parse(res._source) : null
  } else {
    // If the version is not specified, get the latest version
    const { hits } = await esClient.search<EsDatasetDoc>({
      index: ES_INDEX.dataset,
      size: 1,
      query: { term: { datasetId } },
      sort: [
        { version: { order: "desc" } },
        { releaseDate: { order: "desc" } },
      ],
      _source: true,
      track_total_hits: false,
    })
    const hit = hits.hits[0]
    dataset = hit && hit._source ? EsDatasetDocSchema.parse(hit._source) : null
  }

  if (!dataset) return null

  // Authorization check: verify user can access parent Research
  const canAccess = await canAccessDataset(authUser, dataset)
  if (!canAccess) return null

  return dataset
}

export const listDatasetVersions = async (
  datasetId: string,
  authUser: AuthUser | null = null,
): Promise<DatasetVersionItem[] | null> => {
  const res = await esClient.search<EsDatasetDoc>({
    index: ES_INDEX.dataset,
    size: 500,
    query: { term: { datasetId } },
    sort: [
      { version: { order: "desc" } },
      { releaseDate: { order: "desc" } },
    ],
    _source: ["version", "typeOfData", "criteria", "releaseDate", "humId"],
    track_total_hits: false,
  })

  const rows = res.hits.hits
    .map(h => h._source)
    .filter((d): d is EsDatasetDoc => !!d)

  if (rows.length === 0) return []

  // Authorization check: verify user can access parent Research (all versions share same humId)
  const firstRow = rows[0]
  const researchDoc = await getResearchDoc(firstRow.humId)
  if (!researchDoc || !canAccessResearchDoc(authUser, researchDoc)) {
    return null // Return null to indicate not found/unauthorized
  }

  return rows.map(d => ({
    version: d.version,
    typeOfData: d.typeOfData ?? null,
    criteria: d.criteria ?? null,
    releaseDate: d.releaseDate ?? null,
  }))
}

// === Search Functions ===

const splitComma = (s: string | undefined): string[] =>
  s ? s.split(",").map(v => v.trim()).filter(Boolean) : []

const buildDatasetFilterClauses = (params: DatasetSearchQuery | ResearchSearchQuery): estypes.QueryDslQueryContainer[] => {
  const must: estypes.QueryDslQueryContainer[] = []

  // humId filter (Dataset only)
  if ("humId" in params && params.humId) {
    must.push({ term: { humId: params.humId } })
  }

  // criteria filter (comma-separated for OR)
  const criteriaValues = splitComma(params.criteria)
  if (criteriaValues.length > 0) {
    must.push({ terms: { criteria: criteriaValues } })
  }

  // typeOfData filter (partial match, Dataset only)
  if ("typeOfData" in params && params.typeOfData) {
    must.push({
      bool: {
        should: [
          { wildcard: { "typeOfData.ja": { value: `*${params.typeOfData}*`, case_insensitive: true } } },
          { wildcard: { "typeOfData.en": { value: `*${params.typeOfData}*`, case_insensitive: true } } },
        ],
        minimum_should_match: 1,
      },
    })
  }

  // assayType filter (comma-separated for OR)
  const assayTypes = splitComma(params.assayType)
  if (assayTypes.length > 0) {
    must.push(nestedTermsQuery("experiments", "experiments.searchable.assayType", assayTypes))
  }

  // disease filter (partial match on label)
  if (params.disease) {
    must.push(doubleNestedWildcardQuery(
      "experiments",
      "experiments.searchable.diseases",
      "experiments.searchable.diseases.label",
      params.disease,
    ))
  }

  // diseaseIcd10 filter (comma-separated for OR, prefix match)
  if ("diseaseIcd10" in params && params.diseaseIcd10) {
    const icd10Codes = splitComma(params.diseaseIcd10)
    if (icd10Codes.length > 0) {
      // Use prefix matching for ICD-10 codes (e.g., "C" matches "C34", "C50", etc.)
      const icd10Should = icd10Codes.map(code => ({
        nested: {
          path: "experiments",
          query: {
            nested: {
              path: "experiments.searchable.diseases",
              query: {
                prefix: { "experiments.searchable.diseases.icd10": { value: code, case_insensitive: true } },
              },
            },
          },
        },
      }))
      must.push({ bool: { should: icd10Should, minimum_should_match: 1 } })
    }
  }

  // tissue filter (comma-separated for OR)
  const tissues = splitComma(params.tissue)
  if (tissues.length > 0) {
    must.push(nestedTermsQuery("experiments", "experiments.searchable.tissues", tissues))
  }

  // population filter (comma-separated for OR)
  const populations = splitComma(params.population)
  if (populations.length > 0) {
    must.push(nestedTermsQuery("experiments", "experiments.searchable.population", populations))
  }

  // platform filter (partial match on vendor)
  if (params.platform) {
    must.push(nestedWildcardQuery("experiments", "experiments.searchable.platformVendor", params.platform))
  }

  // fileType filter (comma-separated for OR)
  const fileTypes = splitComma(params.fileType)
  if (fileTypes.length > 0) {
    must.push(nestedTermsQuery("experiments", "experiments.searchable.fileTypes", fileTypes))
  }

  // healthStatus filter (comma-separated for OR, direct value)
  if ("healthStatus" in params && params.healthStatus) {
    const healthStatusValues = splitComma(params.healthStatus)
    if (healthStatusValues.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.healthStatus", healthStatusValues))
    }
  }

  // Legacy hasHealthyControl filter (boolean)
  if (params.hasHealthyControl !== undefined) {
    const healthStatusValues = params.hasHealthyControl ? ["healthy", "mixed"] : ["affected"]
    must.push(nestedTermsQuery("experiments", "experiments.searchable.healthStatus", healthStatusValues))
  }

  // isTumor / hasTumor filter
  if (params.hasTumor !== undefined) {
    must.push(nestedBooleanTermQuery("experiments", "experiments.searchable.isTumor", params.hasTumor))
  }
  if ("isTumor" in params && params.isTumor !== undefined) {
    must.push(nestedBooleanTermQuery("experiments", "experiments.searchable.isTumor", params.isTumor))
  }

  // cellLine filter (exact match)
  if ("cellLine" in params && params.cellLine) {
    const cellLineValues = splitComma(params.cellLine)
    if (cellLineValues.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.cellLine", cellLineValues))
    }
  }

  // Legacy hasCellLine filter (boolean, checks existence)
  if (params.hasCellLine !== undefined && params.hasCellLine) {
    must.push(nestedExistsQuery("experiments", "experiments.searchable.cellLine"))
  }

  // subjectCountType filter (comma-separated for OR)
  if ("subjectCountType" in params && params.subjectCountType) {
    const types = splitComma(params.subjectCountType)
    if (types.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.subjectCountType", types))
    }
  }

  // sex filter (comma-separated for OR)
  if ("sex" in params && params.sex) {
    const sexValues = splitComma(params.sex)
    if (sexValues.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.sex", sexValues))
    }
  }

  // ageGroup filter (comma-separated for OR)
  if ("ageGroup" in params && params.ageGroup) {
    const ageGroups = splitComma(params.ageGroup)
    if (ageGroups.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.ageGroup", ageGroups))
    }
  }

  // libraryKits filter (comma-separated for OR)
  if ("libraryKits" in params && params.libraryKits) {
    const kits = splitComma(params.libraryKits)
    if (kits.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.libraryKits", kits))
    }
  }

  // platformModel filter (comma-separated for OR)
  if ("platformModel" in params && params.platformModel) {
    const models = splitComma(params.platformModel)
    if (models.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.platformModel", models))
    }
  }

  // readType filter (comma-separated for OR)
  if ("readType" in params && params.readType) {
    const readTypes = splitComma(params.readType)
    if (readTypes.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.readType", readTypes))
    }
  }

  // referenceGenome filter (comma-separated for OR)
  if ("referenceGenome" in params && params.referenceGenome) {
    const genomes = splitComma(params.referenceGenome)
    if (genomes.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.referenceGenome", genomes))
    }
  }

  // processedDataTypes filter (comma-separated for OR)
  if ("processedDataTypes" in params && params.processedDataTypes) {
    const types = splitComma(params.processedDataTypes)
    if (types.length > 0) {
      must.push(nestedTermsQuery("experiments", "experiments.searchable.processedDataTypes", types))
    }
  }

  // hasPhenotypeData filter (boolean)
  if ("hasPhenotypeData" in params && params.hasPhenotypeData !== undefined) {
    must.push(nestedBooleanTermQuery("experiments", "experiments.searchable.hasPhenotypeData", params.hasPhenotypeData))
  }

  // policyId filter (comma-separated for OR)
  if ("policyId" in params && params.policyId) {
    const policyIds = splitComma(params.policyId)
    if (policyIds.length > 0) {
      must.push(doubleNestedTermsQuery(
        "experiments",
        "experiments.searchable.policies",
        "experiments.searchable.policies.id",
        policyIds,
      ))
    }
  }

  // === Range filters ===

  // releaseDate range (top-level field)
  if ("minReleaseDate" in params && params.minReleaseDate) {
    must.push({ range: { releaseDate: { gte: params.minReleaseDate } } })
  }
  if ("maxReleaseDate" in params && params.maxReleaseDate) {
    must.push({ range: { releaseDate: { lte: params.maxReleaseDate } } })
  }

  // subjectCount range
  if (params.minSubjects !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.subjectCount", { gte: params.minSubjects }))
  }
  if ("maxSubjects" in params && params.maxSubjects !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.subjectCount", { lte: params.maxSubjects }))
  }

  // readLength range
  if ("minReadLength" in params && params.minReadLength !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.readLength", { gte: params.minReadLength }))
  }
  if ("maxReadLength" in params && params.maxReadLength !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.readLength", { lte: params.maxReadLength }))
  }

  // sequencingDepth range
  if ("minSequencingDepth" in params && params.minSequencingDepth !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.sequencingDepth", { gte: params.minSequencingDepth }))
  }
  if ("maxSequencingDepth" in params && params.maxSequencingDepth !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.sequencingDepth", { lte: params.maxSequencingDepth }))
  }

  // targetCoverage range
  if ("minTargetCoverage" in params && params.minTargetCoverage !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.targetCoverage", { gte: params.minTargetCoverage }))
  }
  if ("maxTargetCoverage" in params && params.maxTargetCoverage !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.targetCoverage", { lte: params.maxTargetCoverage }))
  }

  // dataVolumeGb range
  if ("minDataVolumeGb" in params && params.minDataVolumeGb !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.dataVolumeGb", { gte: params.minDataVolumeGb }))
  }
  if ("maxDataVolumeGb" in params && params.maxDataVolumeGb !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.dataVolumeGb", { lte: params.maxDataVolumeGb }))
  }

  // variantCounts range filters
  if ("minVariantSnv" in params && params.minVariantSnv !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.snv", { gte: params.minVariantSnv }))
  }
  if ("maxVariantSnv" in params && params.maxVariantSnv !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.snv", { lte: params.maxVariantSnv }))
  }
  if ("minVariantIndel" in params && params.minVariantIndel !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.indel", { gte: params.minVariantIndel }))
  }
  if ("maxVariantIndel" in params && params.maxVariantIndel !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.indel", { lte: params.maxVariantIndel }))
  }
  if ("minVariantCnv" in params && params.minVariantCnv !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.cnv", { gte: params.minVariantCnv }))
  }
  if ("maxVariantCnv" in params && params.maxVariantCnv !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.cnv", { lte: params.maxVariantCnv }))
  }
  if ("minVariantSv" in params && params.minVariantSv !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.sv", { gte: params.minVariantSv }))
  }
  if ("maxVariantSv" in params && params.maxVariantSv !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.sv", { lte: params.maxVariantSv }))
  }
  if ("minVariantTotal" in params && params.minVariantTotal !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.total", { gte: params.minVariantTotal }))
  }
  if ("maxVariantTotal" in params && params.maxVariantTotal !== undefined) {
    must.push(nestedRangeQuery("experiments", "experiments.searchable.variantCounts.total", { lte: params.maxVariantTotal }))
  }

  return must
}

/** Helper to create nested aggregation with reverse_nested for dataset count */
const nestedFacetAgg = (field: string, size = 50): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    values: {
      terms: { field, size },
      aggs: { dataset_count: { reverse_nested: {} } },
    },
  },
})

/** Helper to create double-nested aggregation (for diseases, policies) */
const doubleNestedFacetAgg = (
  innerPath: string,
  field: string,
  size = 50,
): estypes.AggregationsAggregationContainer => ({
  nested: { path: "experiments" },
  aggs: {
    inner: {
      nested: { path: innerPath },
      aggs: {
        values: {
          terms: { field, size },
          aggs: { dataset_count: { reverse_nested: {} } },
        },
      },
    },
  },
})

const buildFacetAggregations = (): Record<string, estypes.AggregationsAggregationContainer> => ({
  // Top-level facets
  criteria: { terms: { field: "criteria", size: 10 } },

  // Basic nested facets
  assayType: nestedFacetAgg("experiments.searchable.assayType"),
  tissue: nestedFacetAgg("experiments.searchable.tissues"),
  population: nestedFacetAgg("experiments.searchable.population"),
  platformVendor: nestedFacetAgg("experiments.searchable.platformVendor"),
  fileType: nestedFacetAgg("experiments.searchable.fileTypes"),
  healthStatus: nestedFacetAgg("experiments.searchable.healthStatus", 10),

  // Extended facets
  subjectCountType: nestedFacetAgg("experiments.searchable.subjectCountType", 10),
  isTumor: nestedFacetAgg("experiments.searchable.isTumor", 5),
  cellLine: nestedFacetAgg("experiments.searchable.cellLine"),
  sex: nestedFacetAgg("experiments.searchable.sex", 10),
  ageGroup: nestedFacetAgg("experiments.searchable.ageGroup", 10),
  libraryKits: nestedFacetAgg("experiments.searchable.libraryKits"),
  platformModel: nestedFacetAgg("experiments.searchable.platformModel"),
  readType: nestedFacetAgg("experiments.searchable.readType", 10),
  referenceGenome: nestedFacetAgg("experiments.searchable.referenceGenome"),
  processedDataTypes: nestedFacetAgg("experiments.searchable.processedDataTypes"),
  hasPhenotypeData: nestedFacetAgg("experiments.searchable.hasPhenotypeData", 5),

  // Double-nested facets
  disease: doubleNestedFacetAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.label",
  ),
  diseaseIcd10: doubleNestedFacetAgg(
    "experiments.searchable.diseases",
    "experiments.searchable.diseases.icd10",
  ),
  policyId: doubleNestedFacetAgg(
    "experiments.searchable.policies",
    "experiments.searchable.policies.id",
  ),
})

interface TermsBucket {
  key: string | number | boolean
  doc_count: number
  dataset_count?: { doc_count: number }
}

const extractFacets = (aggs: Record<string, unknown> | undefined): FacetsMap => {
  if (!aggs) return {}
  const facets: FacetsMap = {}

  // Extract count from bucket, preferring dataset_count (reverse_nested) for nested aggs
  const extractBuckets = (buckets: TermsBucket[]) =>
    buckets.map(b => ({
      value: String(b.key),
      count: b.dataset_count?.doc_count ?? b.doc_count,
    }))

  // Recursively find buckets in nested aggregations
  const findBuckets = (obj: unknown): TermsBucket[] | null => {
    if (!obj || typeof obj !== "object") return null
    const o = obj as Record<string, unknown>

    // Direct buckets
    if ("buckets" in o && Array.isArray(o.buckets)) {
      return o.buckets as TermsBucket[]
    }

    // Search nested objects (skip doc_count)
    for (const [key, val] of Object.entries(o)) {
      if (key === "doc_count") continue
      if (typeof val === "object" && val !== null) {
        const found = findBuckets(val)
        if (found) return found
      }
    }
    return null
  }

  for (const [key, agg] of Object.entries(aggs)) {
    const buckets = findBuckets(agg)
    if (buckets) {
      facets[key] = extractBuckets(buckets)
    }
  }

  return facets
}

export const searchDatasets = async (
  params: DatasetSearchQuery,
  authUser: AuthUser | null = null,
): Promise<DatasetSearchResponse> => {
  const { page, limit, sort, order, q, includeFacets } = params
  const from = (page - 1) * limit

  // Build query (lang filter removed - documents are BilingualText)
  const must: estypes.QueryDslQueryContainer[] = []

  // Apply authorization filter: Dataset visibility depends on parent Research status
  // Get humIds of accessible Research, then filter Datasets by those humIds
  const accessibleHumIds = await getPublishedHumIds(authUser)
  if (accessibleHumIds !== null) {
    if (accessibleHumIds.length === 0) {
      // No accessible Research, return empty result
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: includeFacets ? {} : undefined,
      }
    }
    must.push({ terms: { humId: accessibleHumIds } })
  }

  must.push(...buildDatasetFilterClauses(params))

  // Full-text search
  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: [
          "typeOfData.ja^2",
          "typeOfData.en^2",
          "experiments.header.ja.text",
          "experiments.header.en.text",
        ],
        type: "best_fields",
        fuzziness: "AUTO",
      },
    })
  }

  // Sort configuration
  // Note: subjectCount sorting would require aggregating across nested experiments,
  // which is not directly sortable. Fallback to datasetId for subjectCount sort.
  let sortSpec: estypes.Sort
  if (sort === "relevance" && q) {
    sortSpec = [{ _score: { order: "desc" } }, { datasetId: { order: "asc" } }]
  } else if (sort === "subjectCount") {
    // Cannot sort by aggregated subject count from nested experiments directly
    // Fallback to datasetId
    sortSpec = [{ datasetId: { order } }]
  } else if (sort === "releaseDate") {
    sortSpec = [{ releaseDate: { order, missing: "_last" } }, { datasetId: { order: "asc" } }]
  } else {
    sortSpec = [{ datasetId: { order } }]
  }

  interface Aggs {
    uniq_ids: estypes.AggregationsCardinalityAggregate
    [key: string]: estypes.AggregationsAggregate
  }

  const res = await esClient.search<EsDatasetDoc, Aggs>({
    index: ES_INDEX.dataset,
    from,
    size: limit,
    query: { bool: { must } },
    collapse: {
      field: "datasetId",
      inner_hits: {
        name: "latest",
        size: 1,
        sort: [
          { version: { order: "desc" as const } },
          { releaseDate: { order: "desc" as const } },
        ],
        _source: true,
      },
    },
    sort: sortSpec,
    _source: false,
    track_total_hits: true,
    aggs: {
      uniq_ids: { cardinality: { field: "datasetId" } },
      ...(includeFacets ? buildFacetAggregations() : {}),
    },
  })

  interface InnerHit { _id: string; _source?: EsDatasetDoc }
  interface Hit { inner_hits?: { latest?: { hits: { hits: InnerHit[] } } } }

  const hits = (res.hits.hits as Hit[])
    .flatMap(hit => hit.inner_hits?.latest?.hits.hits ?? [])
    .map(inner => inner._source)
    .filter((src): src is EsDatasetDoc => !!src)
    .map(src => EsDatasetDocSchema.parse(src))

  const total = esTotal(res.aggregations?.uniq_ids?.value ?? 0)
  const facets = includeFacets ? extractFacets(res.aggregations as unknown as Record<string, unknown>) : undefined

  return {
    data: hits,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      hasNext: from + limit < total,
      hasPrev: from > 0,
    },
    facets,
  }
}

const hasDatasetFilters = (params: ResearchSearchQuery): boolean => {
  return !!(
    params.assayType ||
    params.disease ||
    params.tissue ||
    params.population ||
    params.platform ||
    params.criteria ||
    params.fileType ||
    params.hasHealthyControl !== undefined ||
    params.hasTumor !== undefined ||
    params.hasCellLine !== undefined ||
    params.minSubjects !== undefined ||
    // Extended filters
    ("healthStatus" in params && params.healthStatus) ||
    ("subjectCountType" in params && params.subjectCountType) ||
    ("sex" in params && params.sex) ||
    ("ageGroup" in params && params.ageGroup) ||
    ("libraryKits" in params && params.libraryKits) ||
    ("platformModel" in params && params.platformModel) ||
    ("readType" in params && params.readType) ||
    ("referenceGenome" in params && params.referenceGenome) ||
    ("processedDataTypes" in params && params.processedDataTypes) ||
    ("hasPhenotypeData" in params && params.hasPhenotypeData !== undefined) ||
    ("policyId" in params && params.policyId) ||
    ("diseaseIcd10" in params && params.diseaseIcd10) ||
    ("cellLine" in params && params.cellLine) ||
    ("isTumor" in params && params.isTumor !== undefined) ||
    // Range filters
    ("minReleaseDate" in params && params.minReleaseDate) ||
    ("maxReleaseDate" in params && params.maxReleaseDate) ||
    ("maxSubjects" in params && params.maxSubjects !== undefined) ||
    ("minReadLength" in params && params.minReadLength !== undefined) ||
    ("maxReadLength" in params && params.maxReadLength !== undefined) ||
    ("minSequencingDepth" in params && params.minSequencingDepth !== undefined) ||
    ("maxSequencingDepth" in params && params.maxSequencingDepth !== undefined) ||
    ("minTargetCoverage" in params && params.minTargetCoverage !== undefined) ||
    ("maxTargetCoverage" in params && params.maxTargetCoverage !== undefined) ||
    ("minDataVolumeGb" in params && params.minDataVolumeGb !== undefined) ||
    ("maxDataVolumeGb" in params && params.maxDataVolumeGb !== undefined) ||
    ("minVariantSnv" in params && params.minVariantSnv !== undefined) ||
    ("maxVariantSnv" in params && params.maxVariantSnv !== undefined) ||
    ("minVariantIndel" in params && params.minVariantIndel !== undefined) ||
    ("maxVariantIndel" in params && params.maxVariantIndel !== undefined) ||
    ("minVariantCnv" in params && params.minVariantCnv !== undefined) ||
    ("maxVariantCnv" in params && params.maxVariantCnv !== undefined) ||
    ("minVariantSv" in params && params.minVariantSv !== undefined) ||
    ("maxVariantSv" in params && params.maxVariantSv !== undefined) ||
    ("minVariantTotal" in params && params.minVariantTotal !== undefined) ||
    ("maxVariantTotal" in params && params.maxVariantTotal !== undefined)
  )
}

const getHumIdsByDatasetFilters = async (
  params: ResearchSearchQuery,
): Promise<string[]> => {
  // lang filter removed - documents are BilingualText
  const must: estypes.QueryDslQueryContainer[] = []
  must.push(...buildDatasetFilterClauses(params))

  interface HumIdAggs {
    humIds: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>
  }

  const res = await esClient.search<unknown, HumIdAggs>({
    index: ES_INDEX.dataset,
    size: 0,
    query: { bool: { must } },
    aggs: {
      humIds: { terms: { field: "humId", size: 10000 } },
    },
  })

  const buckets = res.aggregations?.humIds?.buckets
  if (!Array.isArray(buckets)) return []
  return buckets.map(b => b.key)
}

export const searchResearches = async (
  params: ResearchSearchQuery,
  authUser: AuthUser | null = null,
): Promise<ResearchSearchResponse> => {
  const { page, limit, lang, sort, order, q, releasedAfter, releasedBefore, includeFacets } = params
  const from = (page - 1) * limit

  // Step 1: If Dataset filters are present, get humIds from Dataset index
  let humIdFilter: string[] | null = null
  if (hasDatasetFilters(params)) {
    humIdFilter = await getHumIdsByDatasetFilters(params)
    if (humIdFilter.length === 0) {
      // No matching datasets, return empty result
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        facets: includeFacets ? {} : undefined,
      }
    }
  }

  // Step 2: Build Research query (lang filter removed - documents are BilingualText)
  const must: estypes.QueryDslQueryContainer[] = []

  // Apply authorization filter
  const statusFilter = buildStatusFilter(authUser)
  if (statusFilter) {
    must.push(statusFilter)
  }

  if (humIdFilter) {
    must.push({ terms: { humId: humIdFilter } })
  }

  // Full-text search
  if (q) {
    must.push({
      bool: {
        should: [
          { match: { "title.ja": { query: q, boost: 2 } } },
          { match: { "title.en": { query: q, boost: 2 } } },
          { match: { "summary.aims.ja.text": q } },
          { match: { "summary.aims.en.text": q } },
          { match: { "summary.methods.ja.text": q } },
          { match: { "summary.methods.en.text": q } },
          {
            nested: {
              path: "dataProvider",
              query: {
                bool: {
                  should: [
                    { match: { "dataProvider.name.ja.text": q } },
                    { match: { "dataProvider.name.en.text": q } },
                  ],
                },
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    })
  }

  // Date range filters (renamed: lastReleaseDate → dateModified, firstReleaseDate → datePublished)
  if (releasedAfter) {
    must.push({ range: { dateModified: { gte: releasedAfter } } })
  }
  if (releasedBefore) {
    must.push({ range: { datePublished: { lte: releasedBefore } } })
  }

  // Sort configuration
  let sortSpec: estypes.Sort
  if (sort === "relevance" && q) {
    sortSpec = [{ _score: { order: "desc" } }, { humId: { order: "asc" } }]
  } else if (sort === "title") {
    sortSpec = [{ "title.kw": { order } }, { humId: { order: "asc" } }]
  } else if (sort === "releaseDate") {
    sortSpec = [{ dateModified: { order, missing: "_last" } }, { humId: { order: "asc" } }]
  } else {
    sortSpec = [{ humId: { order } }]
  }

  const res = await esClient.search<EsResearchDoc>({
    index: ES_INDEX.research,
    from,
    size: limit,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    sort: sortSpec,
    _source: ["humId", "title", "versionIds", "dataProvider", "summary"],
    track_total_hits: true,
  })

  const base = res.hits.hits
    .map(hit => hit._source)
    .filter((doc): doc is EsResearchDoc => !!doc)
    .map(doc => EsResearchDocSchema.pick({
      humId: true, title: true, versionIds: true, dataProvider: true, summary: true,
    }).parse(doc))

  // Fetch version and dataset details
  const rvIds = base.flatMap(doc => doc.versionIds)
  const rvMap = await mgetMap(ES_INDEX.researchVersion, rvIds, EsResearchVersionDocSchema.parse)

  // datasets is now { datasetId, version }[], convert to ES IDs
  const dsRefs = Array.from(rvMap.values()).flatMap(rv => rv.datasets)
  const dsIds = uniq(dsRefs.map(ref => `${ref.datasetId}-${ref.version}`))
  const dsMap = await mgetMap(ES_INDEX.dataset, dsIds, EsDatasetDocSchema.parse)

  // Helper to extract text from BilingualTextValue
  const extractText = (value: { ja: { text: string } | null; en: { text: string } | null } | null | undefined): string => {
    if (!value) return ""
    return value[lang]?.text ?? value.ja?.text ?? value.en?.text ?? ""
  }

  // Helper to extract string from BilingualText
  const extractStr = (value: { ja: string | null; en: string | null } | null | undefined): string => {
    if (!value) return ""
    return value[lang] ?? value.ja ?? value.en ?? ""
  }

  const data: ResearchSummary[] = base.map(d => {
    const rvs = d.versionIds.map(id => rvMap.get(id)).filter((x): x is EsResearchVersionDoc => !!x)
    const datasetRefs = rvs.flatMap(rv => rv.datasets)
    const datasets = datasetRefs.map(ref => dsMap.get(`${ref.datasetId}-${ref.version}`)).filter((x): x is EsDatasetDoc => !!x)

    const versions = rvs.map(rv => ({ version: rv.version, releaseDate: rv.versionReleaseDate }))
    const methods = extractText(d.summary?.methods)
    const datasetIds = uniq(datasets.map(ds => ds.datasetId))
    // typeOfData is now BilingualText, extract as array with both languages
    const typeOfData = uniq(datasets.map(ds => extractStr(ds.typeOfData)).filter(x => !!x))
    const platforms = uniq(
      datasets
        .flatMap(ds => ds.experiments.map(e => extractText(e.data["Platform"])))
        .filter(p => !!p),
    )
    const targets = extractText(d.summary?.targets)
    // dataProvider.name is BilingualTextValue, extract text
    const dataProvider = uniq((d.dataProvider ?? []).map(p => extractText(p.name)).filter(x => !!x))
    const criteria = datasets.map(ds => ds.criteria).find(x => !!x) ?? ""

    return { humId: d.humId, lang, title: extractStr(d.title), versions, methods, datasetIds, typeOfData, platforms, targets, dataProvider, criteria }
  })

  const total = esTotal(res.hits.total)

  // Get facets from Dataset index if requested (lang filter removed)
  let facets: FacetsMap | undefined
  if (includeFacets) {
    const datasetFacetQuery: estypes.QueryDslQueryContainer[] = []
    if (humIdFilter) {
      datasetFacetQuery.push({ terms: { humId: humIdFilter } })
    } else if (data.length > 0) {
      datasetFacetQuery.push({ terms: { humId: data.map(d => d.humId) } })
    }

    const facetRes = await esClient.search({
      index: ES_INDEX.dataset,
      size: 0,
      query: datasetFacetQuery.length > 0 ? { bool: { must: datasetFacetQuery } } : { match_all: {} },
      aggs: buildFacetAggregations(),
    })

    facets = extractFacets(facetRes.aggregations as unknown as Record<string, unknown>)
  }

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      hasNext: from + limit < total,
      hasPrev: from > 0,
    },
    facets,
  }
}

// === Additional API Functions ===

/**
 * Get Research by Dataset ID
 * Returns the parent Research that contains the specified Dataset
 */
export const getResearchByDatasetId = async (
  datasetId: string,
  authUser: AuthUser | null = null,
): Promise<EsResearchDetail | null> => {
  // First, get the Dataset to find its humId
  const dataset = await getDataset(datasetId, {}, authUser)
  if (!dataset) return null

  // Get the Research detail using the humId from the Dataset
  return getResearchDetail(dataset.humId, {}, authUser)
}

/**
 * Get pending reviews (Research with status='review')
 * Admin only - returns list of Research awaiting approval
 */
export const getPendingReviews = async (
  page = 1,
  limit = 20,
): Promise<{ data: EsResearchDoc[]; total: number }> => {
  const from = (page - 1) * limit

  const res = await esClient.search<EsResearchDoc>({
    index: ES_INDEX.research,
    from,
    size: limit,
    query: { term: { status: "review" } },
    sort: [{ dateModified: { order: "desc" } }],
    _source: true,
    track_total_hits: true,
  })

  const data = res.hits.hits
    .map(hit => hit._source)
    .filter((doc): doc is EsResearchDoc => !!doc)
    .map(doc => EsResearchDocSchema.parse(doc))

  const total = esTotal(res.hits.total)

  return { data, total }
}

// === Status Transition Types ===
// === Research CRUD Functions ===

type ResearchStatus = "draft" | "review" | "published" | "deleted"
type StatusAction = "submit" | "approve" | "reject" | "unpublish"

interface StatusTransition {
  from: ResearchStatus
  to: ResearchStatus
  allowedBy: "owner" | "admin"
}

const STATUS_TRANSITIONS: Record<StatusAction, StatusTransition> = {
  submit: { from: "draft", to: "review", allowedBy: "owner" },
  approve: { from: "review", to: "published", allowedBy: "admin" },
  reject: { from: "review", to: "draft", allowedBy: "admin" },
  unpublish: { from: "published", to: "draft", allowedBy: "admin" },
}

// === Status Transition Functions ===

/**
 * Validate status transition
 * Returns error message if invalid, null if valid
 */
export const validateStatusTransition = (
  currentStatus: ResearchStatus,
  action: StatusAction,
): string | null => {
  const transition = STATUS_TRANSITIONS[action]
  if (!transition) {
    return `Unknown action: ${action}`
  }
  if (currentStatus !== transition.from) {
    return `Cannot ${action} from status '${currentStatus}'. Expected '${transition.from}'.`
  }
  return null
}

/**
 * Check if user is allowed to perform status transition
 */
export const canPerformTransition = (
  authUser: AuthUser | null,
  research: EsResearchDoc,
  action: StatusAction,
): boolean => {
  if (!authUser) return false

  const transition = STATUS_TRANSITIONS[action]
  if (!transition) return false

  if (transition.allowedBy === "admin") {
    return authUser.isAdmin
  }

  // owner action: must be admin or in uids
  return authUser.isAdmin || research.uids.includes(authUser.userId)
}

/**
 * Get Research document with sequence number for optimistic locking
 */
export const getResearchWithSeqNo = async (
  humId: string,
): Promise<{ doc: EsResearchDoc; seqNo: number; primaryTerm: number } | null> => {
  const res = await esClient.get<EsResearchDoc>({
    index: ES_INDEX.research,
    id: humId,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsResearchDocSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

/**
 * Update Research status with optimistic locking
 * Returns updated document on success, null on conflict
 */
export const updateResearchStatus = async (
  humId: string,
  newStatus: ResearchStatus,
  seqNo: number,
  primaryTerm: number,
): Promise<EsResearchDoc | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          status: newStatus,
          dateModified: now,
        },
      },
    })

    // Fetch and return updated document
    return getResearchDoc(humId)
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }
}

/**
 * Update Research UIDs (owner list) with optimistic locking
 * Admin only - changes who can edit this research
 * Returns updated uids on success, null on conflict
 */
export const updateResearchUids = async (
  humId: string,
  uids: string[],
  seqNo: number,
  primaryTerm: number,
): Promise<string[] | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          uids,
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })

    return uids
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }
}

// === Research CRUD Operations ===

/**
 * Generate next humId
 * humId format: "hum" + 4 digits (hum0001, hum0002, ...)
 */
export const generateNextHumId = async (): Promise<string> => {
  interface MaxIdAggs {
    max_id: { value: number | null }
  }

  const res = await esClient.search<unknown, MaxIdAggs>({
    index: ES_INDEX.research,
    size: 0,
    aggs: {
      max_id: {
        max: {
          script: {
            source: "Integer.parseInt(doc['humId'].value.substring(3))",
          },
        },
      },
    },
  })

  const maxNum = res.aggregations?.max_id?.value ?? 0
  return `hum${String(maxNum + 1).padStart(4, "0")}`
}

/**
 * Create Research with initial version (v1)
 * Admin only - creates Research (status=draft) + ResearchVersion (v1)
 *
 * @param params - Research data (title, summary, dataProvider, etc.)
 * @param uids - User IDs (Keycloak sub) who can edit this research
 * @param humId - Optional humId (auto-generated if not provided)
 * @param initialReleaseNote - Optional release note for v1
 * @returns Created Research and ResearchVersion
 */
export const createResearch = async (params: {
  title: { ja: string | null; en: string | null }
  summary: {
    aims: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    methods: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    targets: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    url: { ja: { text: string; url: string }[]; en: { text: string; url: string }[] }
    footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
  }
  dataProvider: {
    name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    email?: string | null
    orcid?: string | null
    organization?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      address?: { country?: string | null } | null
    } | null
    datasetIds?: string[]
    researchTitle?: { ja: string | null; en: string | null }
    periodOfDataUse?: { startDate: string | null; endDate: string | null } | null
  }[]
  researchProject: {
    name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    url?: { ja: { text: string; url: string } | null; en: { text: string; url: string } | null } | null
  }[]
  grant: {
    id: string[]
    title: { ja: string | null; en: string | null }
    agency: { name: { ja: string | null; en: string | null } }
  }[]
  relatedPublication: {
    title: { ja: string | null; en: string | null }
    doi?: string | null
    datasetIds?: string[]
  }[]
  uids: string[]
  humId?: string
  initialReleaseNote?: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
}): Promise<{ research: EsResearchDoc; version: EsResearchVersionDoc }> => {
  const now = new Date().toISOString().split("T")[0]

  // Generate humId if not provided
  const humId = params.humId ?? await generateNextHumId()
  const version = "v1"
  const humVersionId = `${humId}.${version}`

  // Create Research document
  const researchDoc: EsResearchDoc = {
    humId,
    url: { ja: `https://humandbs.dbcls.jp/hum${humId.substring(3).padStart(4, "0")}`, en: `https://humandbs.dbcls.jp/en/hum${humId.substring(3).padStart(4, "0")}` },
    title: params.title,
    summary: params.summary,
    dataProvider: params.dataProvider,
    researchProject: params.researchProject,
    grant: params.grant,
    relatedPublication: params.relatedPublication,
    controlledAccessUser: [],
    versionIds: [humVersionId],
    latestVersion: version,
    datePublished: now,
    dateModified: now,
    status: "draft",
    uids: params.uids,
  }

  // Create ResearchVersion document (v1)
  const versionDoc: EsResearchVersionDoc = {
    humId,
    humVersionId,
    version,
    versionReleaseDate: now,
    datasets: [],
    releaseNote: params.initialReleaseNote ?? { ja: null, en: null },
  }

  // Index documents (version first, then research)
  // On failure, we attempt to clean up
  try {
    await esClient.index({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
      body: versionDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    throw new Error(`Failed to create ResearchVersion: ${error}`)
  }

  try {
    await esClient.index({
      index: ES_INDEX.research,
      id: humId,
      body: researchDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    // Best effort rollback: delete the version document
    await esClient.delete({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
    }, { ignore: [404] })
    throw new Error(`Failed to create Research: ${error}`)
  }

  return {
    research: EsResearchDocSchema.parse(researchDoc),
    version: EsResearchVersionDocSchema.parse(versionDoc),
  }
}

/**
 * Update Research document with optimistic locking
 * Owner or admin can update
 *
 * @param humId - Research ID
 * @param updates - Fields to update
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns Updated Research document, null on conflict
 */
export const updateResearch = async (
  humId: string,
  updates: {
    url?: { ja: string | null; en: string | null }
    title?: { ja: string | null; en: string | null }
    summary?: {
      aims: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      methods: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      targets: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      url: { ja: { text: string; url: string }[]; en: { text: string; url: string }[] }
      footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
    }
    dataProvider?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      email?: string | null
      orcid?: string | null
      organization?: {
        name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
        address?: { country?: string | null } | null
      } | null
      datasetIds?: string[]
      researchTitle?: { ja: string | null; en: string | null }
      periodOfDataUse?: { startDate: string | null; endDate: string | null } | null
    }[]
    researchProject?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      url?: { ja: { text: string; url: string } | null; en: { text: string; url: string } | null } | null
    }[]
    grant?: {
      id: string[]
      title: { ja: string | null; en: string | null }
      agency: { name: { ja: string | null; en: string | null } }
    }[]
    relatedPublication?: {
      title: { ja: string | null; en: string | null }
      doi?: string | null
      datasetIds?: string[]
    }[]
    controlledAccessUser?: {
      name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      email?: string | null
      orcid?: string | null
      organization?: {
        name: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
        address?: { country?: string | null } | null
      } | null
      datasetIds?: string[]
      researchTitle?: { ja: string | null; en: string | null }
      periodOfDataUse?: { startDate: string | null; endDate: string | null } | null
    }[]
  },
  seqNo: number,
  primaryTerm: number,
): Promise<EsResearchDoc | null> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          ...updates,
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })

    return getResearchDoc(humId)
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }
}

/**
 * Delete Research (logical deletion)
 * Admin only - sets status to "deleted"
 *
 * @param humId - Research ID
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns true on success, false on conflict
 */
export const deleteResearch = async (
  humId: string,
  seqNo: number,
  primaryTerm: number,
): Promise<boolean> => {
  try {
    const now = new Date().toISOString().split("T")[0]

    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          status: "deleted",
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })

    return true
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return false // Conflict
      }
    }
    throw error
  }
}

/**
 * Create a new Research version
 * Owner or admin can create
 *
 * @param humId - Research ID
 * @param releaseNote - Release note for the new version
 * @param datasets - Optional datasets to link (defaults to copying from latest version)
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns Created ResearchVersion, null on conflict
 */
export const createResearchVersion = async (
  humId: string,
  releaseNote: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null },
  datasets: { datasetId: string; version: string }[] | undefined,
  seqNo: number,
  primaryTerm: number,
): Promise<EsResearchVersionDoc | null> => {
  const now = new Date().toISOString().split("T")[0]

  // Get current research to determine new version number
  const research = await getResearchDoc(humId)
  if (!research) {
    throw new Error(`Research ${humId} not found`)
  }

  // Calculate new version number
  const currentVersionNum = research.versionIds.length
  const newVersion = `v${currentVersionNum + 1}`
  const newHumVersionId = `${humId}.${newVersion}`

  // If datasets not provided, copy from latest version
  let datasetsToUse = datasets
  if (datasetsToUse === undefined) {
    const latestVersion = await getResearchVersion(humId, {})
    datasetsToUse = latestVersion?.datasets ?? []
  }

  // Create new ResearchVersion document
  const versionDoc: EsResearchVersionDoc = {
    humId,
    humVersionId: newHumVersionId,
    version: newVersion,
    versionReleaseDate: now,
    datasets: datasetsToUse,
    releaseNote,
  }

  // Index the version document first
  try {
    await esClient.index({
      index: ES_INDEX.researchVersion,
      id: newHumVersionId,
      body: versionDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    throw new Error(`Failed to create ResearchVersion: ${error}`)
  }

  // Update Research to add new version to versionIds and update latestVersion
  try {
    await esClient.update({
      index: ES_INDEX.research,
      id: humId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          versionIds: [...research.versionIds, newHumVersionId],
          latestVersion: newVersion,
          dateModified: now,
        },
      },
      refresh: "wait_for",
    })
  } catch (error: unknown) {
    // Best effort rollback: delete the version document
    await esClient.delete({
      index: ES_INDEX.researchVersion,
      id: newHumVersionId,
    }, { ignore: [404] })

    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }

  return EsResearchVersionDocSchema.parse(versionDoc)
}

/**
 * Get ResearchVersion document with sequence number for optimistic locking
 */
export const getResearchVersionWithSeqNo = async (
  humVersionId: string,
): Promise<{ doc: EsResearchVersionDoc; seqNo: number; primaryTerm: number } | null> => {
  const res = await esClient.get<EsResearchVersionDoc>({
    index: ES_INDEX.researchVersion,
    id: humVersionId,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsResearchVersionDocSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

/**
 * Link a Dataset to a Research (updates latest ResearchVersion)
 * Owner or admin can link
 *
 * @param humId - Research ID
 * @param datasetId - Dataset ID to link
 * @param version - Dataset version to link
 * @returns Updated datasets array, null on conflict or not found
 */
export const linkDatasetToResearch = async (
  humId: string,
  datasetId: string,
  version: string,
): Promise<{ datasetId: string; version: string }[] | null> => {
  // Get latest ResearchVersion
  const latestVersion = await getResearchVersion(humId, {})
  if (!latestVersion) {
    return null
  }

  const humVersionId = latestVersion.humVersionId

  // Get with sequence number for optimistic locking
  const versionWithSeq = await getResearchVersionWithSeqNo(humVersionId)
  if (!versionWithSeq) {
    return null
  }

  const { doc, seqNo, primaryTerm } = versionWithSeq

  // Check if dataset is already linked
  const isAlreadyLinked = doc.datasets.some(
    d => d.datasetId === datasetId && d.version === version,
  )
  if (isAlreadyLinked) {
    return doc.datasets // Already linked, return current state
  }

  // Add dataset to the list
  const newDatasets = [...doc.datasets, { datasetId, version }]

  try {
    await esClient.update({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          datasets: newDatasets,
        },
      },
      refresh: "wait_for",
    })

    return newDatasets
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }
}

/**
 * Unlink a Dataset from a Research (updates latest ResearchVersion)
 * Owner or admin can unlink
 *
 * @param humId - Research ID
 * @param datasetId - Dataset ID to unlink
 * @param version - Optional: specific version to unlink (if not provided, unlinks all versions)
 * @returns true on success, false on conflict or not found
 */
export const unlinkDatasetFromResearch = async (
  humId: string,
  datasetId: string,
  version?: string,
): Promise<boolean> => {
  // Get latest ResearchVersion
  const latestVersion = await getResearchVersion(humId, {})
  if (!latestVersion) {
    return false
  }

  const humVersionId = latestVersion.humVersionId

  // Get with sequence number for optimistic locking
  const versionWithSeq = await getResearchVersionWithSeqNo(humVersionId)
  if (!versionWithSeq) {
    return false
  }

  const { doc, seqNo, primaryTerm } = versionWithSeq

  // Filter out the dataset(s)
  const newDatasets = version
    ? doc.datasets.filter(d => !(d.datasetId === datasetId && d.version === version))
    : doc.datasets.filter(d => d.datasetId !== datasetId)

  // If nothing was removed, still return success
  if (newDatasets.length === doc.datasets.length) {
    return true // Nothing to unlink, but not an error
  }

  try {
    await esClient.update({
      index: ES_INDEX.researchVersion,
      id: humVersionId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: {
          datasets: newDatasets,
        },
      },
      refresh: "wait_for",
    })

    return true
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return false // Conflict
      }
    }
    throw error
  }
}

// === Dataset CRUD Operations ===

/**
 * Get Dataset document with sequence number for optimistic locking
 */
export const getDatasetWithSeqNo = async (
  datasetId: string,
  version: string,
): Promise<{ doc: EsDatasetDoc; seqNo: number; primaryTerm: number } | null> => {
  const id = `${datasetId}-${version}`
  const res = await esClient.get<EsDatasetDoc>({
    index: ES_INDEX.dataset,
    id,
  }, { ignore: [404] })

  if (!res.found || !res._source) return null

  return {
    doc: EsDatasetDocSchema.parse(res._source),
    seqNo: res._seq_no ?? 0,
    primaryTerm: res._primary_term ?? 0,
  }
}

/**
 * Generate a draft Dataset ID
 * Format: DRAFT-{humId}-{uuid}
 */
export const generateDraftDatasetId = (humId: string): string => {
  const uuid = crypto.randomUUID().split("-")[0] // Short UUID (first 8 chars)
  return `DRAFT-${humId}-${uuid}`
}

/**
 * Get the next version number for a dataset
 */
const getNextDatasetVersion = async (datasetId: string): Promise<string> => {
  interface MaxVersionAggs {
    max_version: { value: number | null }
  }

  const res = await esClient.search<unknown, MaxVersionAggs>({
    index: ES_INDEX.dataset,
    size: 0,
    query: { term: { datasetId } },
    aggs: {
      max_version: {
        max: {
          script: {
            source: "Integer.parseInt(doc['version'].value.substring(1))",
          },
        },
      },
    },
  })

  const maxNum = res.aggregations?.max_version?.value ?? 0
  return `v${maxNum + 1}`
}

/**
 * Create a new Dataset
 * Authenticated user (parent Research owner) can create
 *
 * @param params - Dataset data
 * @param autoLinkToResearch - Whether to auto-link to ResearchVersion (default: true)
 * @returns Created Dataset document
 */
export const createDataset = async (params: {
  datasetId?: string // Optional: auto-generates DRAFT-{humId}-{uuid} if not provided
  humId: string
  humVersionId: string
  releaseDate: string
  criteria: "Controlled-access (Type I)" | "Controlled-access (Type II)" | "Unrestricted-access"
  typeOfData: { ja: string | null; en: string | null }
  experiments: {
    header: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
    data: Record<string, { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null } | null>
    footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
  }[]
}, autoLinkToResearch = true): Promise<EsDatasetDoc> => {
  const now = new Date().toISOString().split("T")[0]

  // Generate datasetId if not provided
  const datasetId = params.datasetId ?? generateDraftDatasetId(params.humId)

  // Get the next version number
  const version = await getNextDatasetVersion(datasetId)

  // Create Dataset document
  const datasetDoc: EsDatasetDoc = {
    datasetId,
    version,
    versionReleaseDate: now,
    humId: params.humId,
    humVersionId: params.humVersionId,
    releaseDate: params.releaseDate,
    criteria: params.criteria,
    typeOfData: params.typeOfData,
    experiments: params.experiments,
  }

  const esId = `${datasetId}-${version}`

  // Index the dataset document
  try {
    await esClient.index({
      index: ES_INDEX.dataset,
      id: esId,
      body: datasetDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    throw new Error(`Failed to create Dataset: ${error}`)
  }

  // Auto-link to ResearchVersion if requested
  if (autoLinkToResearch) {
    try {
      // Extract humId from humVersionId (e.g., "hum0001.v1" -> "hum0001")
      const humId = params.humVersionId.split(".")[0]
      await linkDatasetToResearch(humId, datasetId, version)
    } catch (error) {
      // Log warning but don't fail the dataset creation
      console.warn(`Failed to auto-link dataset to research: ${error}`)
    }
  }

  return EsDatasetDocSchema.parse(datasetDoc)
}

/**
 * Update Dataset document with optimistic locking
 * Owner or admin can update
 *
 * @param datasetId - Dataset ID
 * @param version - Dataset version
 * @param updates - Fields to update
 * @param seqNo - Sequence number for optimistic locking
 * @param primaryTerm - Primary term for optimistic locking
 * @returns Updated Dataset document, null on conflict
 */
export const updateDataset = async (
  datasetId: string,
  version: string,
  updates: {
    releaseDate?: string
    criteria?: "Controlled-access (Type I)" | "Controlled-access (Type II)" | "Unrestricted-access"
    typeOfData?: { ja: string | null; en: string | null }
    experiments?: {
      header: { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null }
      data: Record<string, { ja: { text: string; rawHtml: string } | null; en: { text: string; rawHtml: string } | null } | null>
      footers: { ja: { text: string; rawHtml: string }[]; en: { text: string; rawHtml: string }[] }
    }[]
    humId?: string
    humVersionId?: string
  },
  seqNo: number,
  primaryTerm: number,
): Promise<EsDatasetDoc | null> => {
  const esId = `${datasetId}-${version}`

  try {
    await esClient.update({
      index: ES_INDEX.dataset,
      id: esId,
      if_seq_no: seqNo,
      if_primary_term: primaryTerm,
      body: {
        doc: updates,
      },
      refresh: "wait_for",
    })

    const result = await getDatasetWithSeqNo(datasetId, version)
    return result?.doc ?? null
  } catch (error: unknown) {
    // Check for version conflict
    if (error && typeof error === "object" && "meta" in error) {
      const esError = error as { meta?: { statusCode?: number } }
      if (esError.meta?.statusCode === 409) {
        return null // Conflict
      }
    }
    throw error
  }
}

/**
 * Replace Dataset ID (for converting draft ID to official ID)
 * Owner or admin can replace
 *
 * This is a complex operation:
 * 1. Get old Dataset document
 * 2. Create new document with new datasetId
 * 3. Update ResearchVersion.datasets references
 * 4. Delete old document
 *
 * @param oldDatasetId - Current dataset ID
 * @param version - Dataset version
 * @param newDatasetId - New dataset ID
 * @returns Updated Dataset document, null on not found
 */
export const replaceDatasetId = async (
  oldDatasetId: string,
  version: string,
  newDatasetId: string,
): Promise<EsDatasetDoc | null> => {
  // Get old dataset
  const oldResult = await getDatasetWithSeqNo(oldDatasetId, version)
  if (!oldResult) {
    return null
  }

  const oldDoc = oldResult.doc
  const oldEsId = `${oldDatasetId}-${version}`
  const newEsId = `${newDatasetId}-${version}`

  // Create new document with new datasetId
  const newDoc: EsDatasetDoc = {
    ...oldDoc,
    datasetId: newDatasetId,
  }

  // Index the new document
  try {
    await esClient.index({
      index: ES_INDEX.dataset,
      id: newEsId,
      body: newDoc,
      refresh: "wait_for",
    })
  } catch (error) {
    throw new Error(`Failed to create new Dataset with ID ${newDatasetId}: ${error}`)
  }

  // Update ResearchVersion.datasets references
  const humId = oldDoc.humId
  try {
    const latestVersion = await getResearchVersion(humId, {})
    if (latestVersion) {
      const versionWithSeq = await getResearchVersionWithSeqNo(latestVersion.humVersionId)
      if (versionWithSeq) {
        const { doc: versionDoc, seqNo, primaryTerm } = versionWithSeq
        const newDatasets = versionDoc.datasets.map(d =>
          d.datasetId === oldDatasetId && d.version === version
            ? { datasetId: newDatasetId, version }
            : d,
        )

        await esClient.update({
          index: ES_INDEX.researchVersion,
          id: latestVersion.humVersionId,
          if_seq_no: seqNo,
          if_primary_term: primaryTerm,
          body: {
            doc: { datasets: newDatasets },
          },
          refresh: "wait_for",
        })
      }
    }
  } catch (error) {
    // If reference update fails, delete the new document and rethrow
    await esClient.delete({
      index: ES_INDEX.dataset,
      id: newEsId,
    }, { ignore: [404] })
    throw new Error(`Failed to update ResearchVersion references: ${error}`)
  }

  // Delete old document
  try {
    await esClient.delete({
      index: ES_INDEX.dataset,
      id: oldEsId,
      refresh: "wait_for",
    })
  } catch (error) {
    // Log warning but don't fail - new document exists
    console.warn(`Failed to delete old Dataset ${oldEsId}: ${error}`)
  }

  return EsDatasetDocSchema.parse(newDoc)
}

/**
 * Delete Dataset (physical deletion)
 * Admin only - removes from ES and ResearchVersion.datasets
 *
 * @param datasetId - Dataset ID
 * @param version - Dataset version to delete (or all versions if not specified)
 * @returns true on success
 */
export const deleteDataset = async (
  datasetId: string,
  version?: string,
): Promise<boolean> => {
  if (version) {
    // Delete specific version
    const esId = `${datasetId}-${version}`

    // Get the dataset to find humId
    const dataset = await getDataset(datasetId, { version })
    if (!dataset) {
      return true // Already deleted
    }

    // Remove from ResearchVersion.datasets
    await unlinkDatasetFromResearch(dataset.humId, datasetId, version)

    // Delete the document
    await esClient.delete({
      index: ES_INDEX.dataset,
      id: esId,
      refresh: "wait_for",
    }, { ignore: [404] })

    return true
  } else {
    // Delete all versions of this dataset
    // First, get all versions
    const { hits } = await esClient.search<EsDatasetDoc>({
      index: ES_INDEX.dataset,
      size: 1000,
      query: { term: { datasetId } },
      _source: ["version", "humId"],
    })

    if (hits.hits.length === 0) {
      return true // Already deleted
    }

    // Get humId from first hit for unlinking
    const firstHit = hits.hits[0]?._source
    if (firstHit) {
      // Remove all versions from ResearchVersion.datasets
      await unlinkDatasetFromResearch(firstHit.humId, datasetId)
    }

    // Delete all documents
    await esClient.deleteByQuery({
      index: ES_INDEX.dataset,
      query: { term: { datasetId } },
      refresh: true,
    })

    return true
  }
}
