/**
 * Elasticsearch Field Paths
 *
 * Centralized field path definitions for type safety and IDE completion.
 * Prevents typos in ES query field references.
 */

// === Research Index Fields ===

export const ES_RESEARCH_FIELDS = {
  humId: "humId",
  title: {
    ja: "title.ja",
    en: "title.en",
  },
  summary: {
    aims: {
      ja: "summary.aims.ja",
      en: "summary.aims.en",
    },
    methods: {
      ja: "summary.methods.ja",
      en: "summary.methods.en",
    },
    targets: {
      ja: "summary.targets.ja",
      en: "summary.targets.en",
    },
  },
  status: "status",
  uids: "uids",
  datePublished: "datePublished",
  dateModified: "dateModified",
  latestVersion: "latestVersion",
  versionIds: "versionIds",
} as const

// === Research Version Index Fields ===

export const ES_RESEARCH_VERSION_FIELDS = {
  humId: "humId",
  humVersionId: "humVersionId",
  version: "version",
  versionReleaseDate: "versionReleaseDate",
  releaseNote: {
    ja: "releaseNote.ja",
    en: "releaseNote.en",
  },
  datasetRefs: "datasetRefs",
} as const

// === Dataset Index Fields ===

export const ES_DATASET_FIELDS = {
  datasetId: "datasetId",
  humId: "humId",
  humVersionId: "humVersionId",
  version: "version",
  versionReleaseDate: "versionReleaseDate",
  releaseDate: "releaseDate",
  criteria: "criteria",
  typeOfData: {
    ja: "typeOfData.ja",
    en: "typeOfData.en",
  },
  experiments: {
    path: "experiments",
    searchable: {
      path: "experiments.searchable",
      assayType: "experiments.searchable.assayType",
      tissues: "experiments.searchable.tissues",
      population: "experiments.searchable.population",
      fileTypes: "experiments.searchable.fileTypes",
      healthStatus: "experiments.searchable.healthStatus",
      subjectCountType: "experiments.searchable.subjectCountType",
      sex: "experiments.searchable.sex",
      ageGroup: "experiments.searchable.ageGroup",
      libraryKits: "experiments.searchable.libraryKits",
      readType: "experiments.searchable.readType",
      referenceGenome: "experiments.searchable.referenceGenome",
      processedDataTypes: "experiments.searchable.processedDataTypes",
      cellLine: "experiments.searchable.cellLine",
      subjectCount: "experiments.searchable.subjectCount",
      readLength: "experiments.searchable.readLength",
      sequencingDepth: "experiments.searchable.sequencingDepth",
      targetCoverage: "experiments.searchable.targetCoverage",
      dataVolumeGb: "experiments.searchable.dataVolumeGb",
      variantCounts: {
        snv: "experiments.searchable.variantCounts.snv",
        indel: "experiments.searchable.variantCounts.indel",
        cnv: "experiments.searchable.variantCounts.cnv",
        sv: "experiments.searchable.variantCounts.sv",
        total: "experiments.searchable.variantCounts.total",
      },
      platform: {
        path: "experiments.searchable.platform",
        vendor: "experiments.searchable.platform.vendor",
        model: "experiments.searchable.platform.model",
      },
      isTumor: "experiments.searchable.isTumor",
      hasPhenotypeData: "experiments.searchable.hasPhenotypeData",
      policyId: "experiments.searchable.policyId",
      diseaseIcd10: "experiments.searchable.diseaseIcd10",
    },
  },
} as const

// === Combined ES Fields for convenience ===

export const ES_FIELDS = {
  research: ES_RESEARCH_FIELDS,
  researchVersion: ES_RESEARCH_VERSION_FIELDS,
  dataset: ES_DATASET_FIELDS,
} as const
