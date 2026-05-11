import type { DatasetFilters } from "@humandbs/backend/types";
import { IsTumorSchema } from "../../../backend/src/crawler/types";

/**
 * Static config describing the UI type and display category for each DatasetFilters field.
 * Fields without a category are rendered as top-level filters (outside any category group).
 */

export const FACET_TYPES = {
  CHECKBOX: "checkbox",
  TEXT: "text",
  TEXT_LIST: "text-list",
  BOOLEAN: "boolean",
  RANGE: "range",
  DATE_RANGE: "date-range",
  ENUM: "enum",
} as const;

export const FACET_CATEGORY = {
  EXPERIMENT_OVERVIEW: "experiment-overview",
  SUBJECTS: "subjects",
  PLATFORM_METHOD: "platform-method",
  SEQUENCING_QUALITY: "sequencing-quality",
  DATA_FORMAT: "data-format",
  POLICY: "policy",
} as const;

type FacetType = (typeof FACET_TYPES)[keyof typeof FACET_TYPES];

export type FacetCategory =
  (typeof FACET_CATEGORY)[keyof typeof FACET_CATEGORY];

export type FacetConfig =
  | {
      type: Exclude<FacetType, typeof FACET_TYPES.ENUM>;
      category?: FacetCategory;
    }
  | {
      type: typeof FACET_TYPES.ENUM;
      options: string[];
      category?: FacetCategory;
    };

export const DATASET_FACET_CONFIG: Record<keyof DatasetFilters, FacetConfig> = {
  // === Experiment Overview (実験の概要) ===
  assayType: { type: "checkbox", category: "experiment-overview" },
  tissues: { type: "checkbox", category: "experiment-overview" },
  disease: { type: "text", category: "experiment-overview" },
  diseaseIcd10: { type: "text-list", category: "experiment-overview" },
  healthStatus: { type: "checkbox", category: "experiment-overview" },
  isTumor: {
    type: "enum",
    options: IsTumorSchema.options,
    category: "experiment-overview",
  },

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
