import type { DatasetFilters } from "@humandbs/backend/types";

/**
 * Static config describing the UI type and display category for each DatasetFilters field.
 * Fields without a category are rendered as top-level filters (outside any category group).
 */

type FacetType =
  | "checkbox"
  | "text"
  | "text-list"
  | "boolean"
  | "range"
  | "date-range";

export type FacetCategory =
  | "experiment-overview"
  | "subjects"
  | "platform-method"
  | "sequencing-quality"
  | "data-format"
  | "policy";

export type FacetConfig = {
  type: FacetType;
  category?: FacetCategory;
};

export const DATASET_FACET_CONFIG: Record<keyof DatasetFilters, FacetConfig> = {
  // === Experiment Overview (実験の概要) ===
  assayType: { type: "checkbox", category: "experiment-overview" },
  tissues: { type: "checkbox", category: "experiment-overview" },
  disease: { type: "text", category: "experiment-overview" },
  diseaseIcd10: { type: "text-list", category: "experiment-overview" },
  healthStatus: { type: "checkbox", category: "experiment-overview" },
  isTumor: { type: "boolean", category: "experiment-overview" },

  // === Subjects (被験者) ===
  subjectCount: { type: "range", category: "subjects" },
  subjectCountType: { type: "checkbox", category: "subjects" },
  sex: { type: "checkbox", category: "subjects" },
  ageGroup: { type: "checkbox", category: "subjects" },
  population: { type: "checkbox", category: "subjects" },
  cellLine: { type: "checkbox", category: "subjects" },

  // === Platform & Method (プラットフォーム・手法) ===
  platform: { type: "checkbox", category: "platform-method" },
  libraryKits: { type: "checkbox", category: "platform-method" },
  readType: { type: "checkbox", category: "platform-method" },
  readLength: { type: "range", category: "platform-method" },

  // === Sequencing Quality (シーケンシング品質) ===
  sequencingDepth: { type: "range", category: "sequencing-quality" },
  targetCoverage: { type: "range", category: "sequencing-quality" },
  referenceGenome: { type: "checkbox", category: "sequencing-quality" },
  variantSnv: { type: "range", category: "sequencing-quality" },
  variantIndel: { type: "range", category: "sequencing-quality" },
  variantCnv: { type: "range", category: "sequencing-quality" },
  variantSv: { type: "range", category: "sequencing-quality" },
  variantTotal: { type: "range", category: "sequencing-quality" },
  hasPhenotypeData: { type: "boolean", category: "sequencing-quality" },

  // === Data Format (データ形式) ===
  fileTypes: { type: "checkbox", category: "data-format" },
  processedDataTypes: { type: "checkbox", category: "data-format" },
  dataVolumeGb: { type: "range", category: "data-format" },

  // === Policy (ポリシー) ===
  policyId: { type: "checkbox", category: "policy" },

  // === Top-level dataset fields (no category — rendered outside category groups) ===
  criteria: { type: "checkbox" },
  releaseDate: { type: "date-range" },
};
