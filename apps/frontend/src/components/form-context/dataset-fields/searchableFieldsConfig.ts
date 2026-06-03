import type React from "react";

import type { FacetCategory } from "@/config/facet-config";

import type { SearchableExperimentFields } from "../../../../../backend/src/crawler/types/structured";

export type RendererProps<
  K extends keyof SearchableExperimentFields = keyof SearchableExperimentFields,
> = {
  fieldKey: K;
  value: SearchableExperimentFields[K];
  defaultValue: SearchableExperimentFields[K];
  onChange: (v: SearchableExperimentFields[K]) => void;
  disabled?: boolean;
};

export type FieldConfig = {
  section?: FacetCategory;
  order?: number;
  hidden?: boolean;
  renderer?: React.ComponentType<RendererProps<any>>;
};

export const searchableFieldsConfig: Partial<
  Record<keyof SearchableExperimentFields, FieldConfig>
> = {
  // Subject / Sample
  subjectCount: { section: "subjects", order: 0 },
  subjectCountType: { section: "subjects", order: 1 },
  healthStatus: { section: "subjects", order: 2 },
  diseases: { section: "subjects", order: 3 },
  tissues: { section: "subjects", order: 4 },
  isTumor: { section: "subjects", order: 5 },
  cellLine: { section: "subjects", order: 6 },
  population: { section: "subjects", order: 7 },
  cohorts: { section: "subjects", order: 8 },

  // Demographics (subjects category, after the sample fields)
  sex: { section: "subjects", order: 9 },
  ageGroup: { section: "subjects", order: 10 },

  // Experimental method
  assayType: { section: "platform-method", order: 0 },
  libraryKits: { section: "platform-method", order: 1 },
  platforms: { section: "platform-method", order: 2 },
  readType: { section: "platform-method", order: 3 },
  readLength: { section: "platform-method", order: 4 },

  // Sequencing quality
  sequencingDepth: { section: "sequencing-quality", order: 0 },
  targetCoverage: { section: "sequencing-quality", order: 1 },
  referenceGenome: { section: "sequencing-quality", order: 2 },
  variantCounts: { section: "sequencing-quality", order: 3 },
  hasPhenotypeData: { section: "sequencing-quality", order: 4 },
  targets: { section: "sequencing-quality", order: 5 },

  // Data info
  fileTypes: { section: "data-format", order: 0 },
  processedDataTypes: { section: "data-format", order: 1 },
  dataVolumeGb: { section: "data-format", order: 2 },

  // Policies — needs custom renderer for domain logic (pre-fill from policyDefaults)
  policies: { section: "policy", order: 0 },
};
