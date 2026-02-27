import type { DatasetFilters } from "@humandbs/backend/types";

/**
 * Static config describing the UI type for each DatasetFilters field.
 * The allFacets API only returns checkbox-type facets, but the schema
 * also includes text, boolean, and range fields that need different UI.
 */

type FacetType = "checkbox" | "text" | "text-list" | "boolean" | "range" | "date-range";

export const DATASET_FACET_CONFIG: Record<keyof DatasetFilters, FacetType> = {
  // Checkbox facets (string[] fields)
  criteria: "checkbox",
  subjectCountType: "checkbox",
  healthStatus: "checkbox",
  diseaseIcd10: "text-list",
  tissues: "checkbox",
  cellLine: "checkbox",
  population: "checkbox",
  sex: "checkbox",
  ageGroup: "checkbox",
  assayType: "checkbox",
  libraryKits: "checkbox",
  platform: "checkbox",
  readType: "checkbox",
  referenceGenome: "checkbox",
  fileTypes: "checkbox",
  processedDataTypes: "checkbox",
  policyId: "checkbox",

  // Text facets (string fields)
  disease: "text",

  // Boolean facets
  isTumor: "boolean",
  hasPhenotypeData: "boolean",

  // Range facets
  releaseDate: "date-range",
  subjectCount: "range",
  readLength: "range",
  sequencingDepth: "range",
  targetCoverage: "range",
  dataVolumeGb: "range",
  variantSnv: "range",
  variantIndel: "range",
  variantCnv: "range",
  variantSv: "range",
  variantTotal: "range",
};
