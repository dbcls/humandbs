import type { DatasetFilters, RangeFilter } from "@humandbs/backend/types";
import type { FACET_TYPES } from "@/config/facet-config";

export type StringArrayKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string[] ? K : never;
}[keyof T];

export type StringKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string ? K : never;
}[keyof T];

export type PlainStringKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string
    ? string extends NonNullable<T[K]>
      ? K
      : never
    : never;
}[keyof T];

export type StringEnumKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string
    ? string extends NonNullable<T[K]>
      ? never
      : K
    : never;
}[keyof T];

export type BooleanKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends boolean ? K : never;
}[keyof T];

export type RangeKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends RangeFilter ? K : never;
}[keyof T];

export type GenericFacetConfig<K extends keyof DatasetFilters> = {
  id: K;
  value: NonNullable<DatasetFilters[K]>;
  groupKey?: string;
  uiGroup?: string;
};

export type RangeFacetConfig = {
  [K in RangeKeys<DatasetFilters>]: GenericFacetConfig<K> & {
    type: typeof FACET_TYPES.RANGE;
  };
}[RangeKeys<DatasetFilters>];

export type DateRangeFacetConfig = {
  [K in RangeKeys<DatasetFilters>]: GenericFacetConfig<K> & {
    type: typeof FACET_TYPES.DATE_RANGE;
  };
}[RangeKeys<DatasetFilters>];

export interface RangeFilterConfig {
  type: "range-filter";
  id: string;
  value: RangeFilter;
  groupKey?: string;
  uiGroup?: string;
}

export interface DateRangeFilterConfig {
  type: "date-range-filter";
  id: string;
  value: RangeFilter;
  groupKey?: string;
  uiGroup?: string;
}

export interface TextFilterConfig {
  type: "text-filter";
  id: string;
  value: string;
  groupKey?: string;
  uiGroup?: string;
}

export type CheckboxFacetConfig = {
  [K in StringArrayKeys<DatasetFilters>]: GenericFacetConfig<K> & {
    type: "checkbox";
    options: string[];
  };
}[StringArrayKeys<DatasetFilters>];

export type TextFacetConfig = {
  [K in PlainStringKeys<DatasetFilters>]: GenericFacetConfig<K> & {
    type: "text";
  };
}[PlainStringKeys<DatasetFilters>];

export type BooleanFacetConfig = {
  [K in BooleanKeys<DatasetFilters>]: GenericFacetConfig<K> & {
    type: typeof FACET_TYPES.BOOLEAN;
  };
}[BooleanKeys<DatasetFilters>];

export type EnumFacetConfig = {
  [K in StringEnumKeys<DatasetFilters>]: GenericFacetConfig<K> & {
    type: typeof FACET_TYPES.ENUM;
    options: string[];
  };
}[StringEnumKeys<DatasetFilters>];

export type TextListFacetConfig = {
  [K in StringArrayKeys<DatasetFilters>]: GenericFacetConfig<K> & {
    type: typeof FACET_TYPES.TEXT_LIST;
  };
}[StringArrayKeys<DatasetFilters>];

export type SectionConfig =
  | CheckboxFacetConfig
  | TextFacetConfig
  | BooleanFacetConfig
  | EnumFacetConfig
  | TextListFacetConfig
  | RangeFacetConfig
  | DateRangeFacetConfig
  | RangeFilterConfig
  | DateRangeFilterConfig
  | TextFilterConfig;

export interface SearchPanelProps {
  sections: SectionConfig[];
  onClose: () => void;
  isFetching: boolean;
  /** Live facet counts from the current search result, keyed by facet field name */
  facetCounts?: Record<string, { value: string; count: number }[]>;
  /**
   * Single commit path. Search/Reset actions apply here via route navigate().
   * Only sets keys declared in sections — sort/order/limit are left untouched.
   */
  onSetFilters: (partial: Record<string, unknown>) => void | Promise<void>;
}

export type DraftState = Record<string, unknown>;

export function isNestedConfig(
  section: SectionConfig,
): section is SectionConfig & { groupKey: string } {
  return "groupKey" in section;
}
