import type { DatasetFilters } from "@humandbs/backend/types";

import type { SectionConfig } from "@/components/SearchPanel";
import { DATASET_FACET_CONFIG } from "@/config/facet-config";

/**
 * Builds SectionConfig[] from DATASET_FACET_CONFIG given the active filter
 * values and allFacets data. Shared between datasets and researches adapters.
 */
export function buildFacetSections(
  activeFilters: Partial<DatasetFilters>,
  groupKey: string,
  allFacetsData: Record<string, { value: string }[]> | undefined,
): SectionConfig[] {
  const result: SectionConfig[] = [];

  for (const [key, facetType] of Object.entries(DATASET_FACET_CONFIG)) {
    const activeValue = activeFilters[key as keyof DatasetFilters];

    switch (facetType) {
      case "checkbox":
        result.push({
          type: "checkbox",
          id: key,
          groupKey,
          value: (activeValue as string[]) ?? [],
          options:
            allFacetsData?.[key]?.map(
              (f: { value: string }) => f.value,
            ) ?? [],
        } as SectionConfig);
        break;
      case "text":
        result.push({
          type: "text",
          id: key,
          groupKey,
          value: (activeValue as string) ?? "",
        } as SectionConfig);
        break;
      case "text-list":
        result.push({
          type: "text-list",
          id: key,
          groupKey,
          value: (activeValue as string[]) ?? [],
        } as SectionConfig);
        break;
      case "boolean":
        result.push({
          type: "boolean",
          id: key,
          groupKey,
          value: activeValue as boolean | undefined,
        } as SectionConfig);
        break;
      case "range":
      case "date-range":
        result.push({
          type: facetType,
          id: key,
          groupKey,
          value:
            (activeValue as {
              min?: string | number;
              max?: string | number;
            }) ?? {},
        } as SectionConfig);
        break;
    }
  }

  return result;
}
