import type { DatasetFilters } from "@humandbs/backend/types";

import type { SectionConfig } from "@/components/SearchPanel";
import { DATASET_FACET_CONFIG } from "@/config/facet-config";

/**
 * Builds SectionConfig[] from DATASET_FACET_CONFIG given the active filter
 * values and allFacets data. Shared between datasets and researches adapters.
 *
 * Each section receives a `uiGroup` matching its facet category so that
 * SearchPanel can render the 6 category headers. Fields without a category
 * (criteria, releaseDate) get no `uiGroup` and fall into the top-level section.
 */
export function buildFacetSections(
  activeFilters: Partial<DatasetFilters>,
  groupKey: string,
  allFacetsData: Record<string, { value: string }[]> | undefined,
): SectionConfig[] {
  const result: SectionConfig[] = [];

  for (const [key, config] of Object.entries(DATASET_FACET_CONFIG)) {
    const { type: facetType, category } = config;
    const activeValue = activeFilters[key as keyof DatasetFilters];
    const uiGroup = category;

    switch (facetType) {
      case "checkbox":
        result.push({
          type: "checkbox",
          id: key,
          groupKey,
          uiGroup,
          value: (activeValue as string[]) ?? [],
          options:
            allFacetsData?.[key]?.map((f: { value: string }) => f.value) ?? [],
        } as SectionConfig);
        break;
      case "text":
        result.push({
          type: "text",
          id: key,
          groupKey,
          uiGroup,
          value: (activeValue as string) ?? "",
        } as SectionConfig);
        break;
      case "text-list":
        result.push({
          type: "text-list",
          id: key,
          groupKey,
          uiGroup,
          value: (activeValue as string[]) ?? [],
        } as SectionConfig);
        break;
      case "boolean":
        result.push({
          type: "boolean",
          id: key,
          groupKey,
          uiGroup,
          value: activeValue as boolean | undefined,
        } as SectionConfig);
        break;
      case "range":
      case "date-range":
        result.push({
          type: facetType,
          id: key,
          groupKey,
          uiGroup,
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
