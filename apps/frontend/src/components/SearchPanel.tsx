import type { DatasetFilters } from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { X as XIcon } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";

const DEBOUNCE_MS = 500;

/**
 * Facet fields rendered as a debounced text input instead of checkboxes.
 * These correspond to z.string() partial-match fields in DatasetFiltersSchema.
 */
const TEXT_INPUT_FACET_FIELDS = new Set<string>(["disease"]);

// === Section config types ===

export interface CheckboxFacetsSectionConfig {
  type: "checkbox-facets";
  /** Key used in toggleArrayFilter and setFilters — e.g. "datasetFilters" | "filters" */
  groupKey: string;
  /** The active DatasetFilters slice, derived from route state in the adapter */
  activeFilters: DatasetFilters;
}

// Future section types will be added to this union:
// export type DateRangeSectionConfig = { type: "date-range"; label: string; fieldKey: string; value: RangeFilter | undefined; onChange: (v: RangeFilter | undefined) => void; };
// export type NumericRangeSectionConfig = { ... };
// export type BooleanSectionConfig = { ... };

export type SectionConfig = CheckboxFacetsSectionConfig;

// === Props ===

export interface SearchPanelProps {
  sections: SectionConfig[];
  onClose: () => void;
  isFetching: boolean;
  /** Live facet counts from the current search result, keyed by facet field name */
  facetCounts?: Record<string, { value: string; count: number }[]>;
  /**
   * Write callback for resets and future non-checkbox section types.
   * Only sets keys declared in sections — pagination/sort are left untouched.
   */
  onSetFilters: (partial: Record<string, unknown>) => void;
  /**
   * Array-toggle helper from useFilters. Handles ref accumulation for
   * successive checkbox clicks within the same render cycle.
   * Only called by checkbox-facets sections internally.
   */
  onToggleArrayFilter: (
    groupKey: string,
    fieldKey: string,
    value: string,
    checked: boolean,
  ) => void;
}

// === Main component ===

export function SearchPanel({
  sections,
  onClose,
  isFetching,
  facetCounts,
  onSetFilters,
  onToggleArrayFilter,
}: SearchPanelProps) {
  const { data: allFacetsData } = useSuspenseQuery(getAllFacetsQueryOptions());

  // Optimistic local state: tracks pending checkbox changes before the URL updates.
  // Shape: { "groupKey:fieldKey:value": true|false }
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const hasAnyFilter = sections.some((s) => {
    if (s.type === "checkbox-facets")
      return Object.keys(s.activeFilters).length > 0;
    return false;
  });

  const handleResetAll = () => {
    const reset = Object.fromEntries(
      sections.map((s) => [s.groupKey, undefined]),
    );
    // Optimistically uncheck all active checkboxes across all checkbox sections
    const allUnchecked = Object.fromEntries(
      sections.flatMap((s) => {
        if (s.type !== "checkbox-facets") return [];
        return Object.entries(s.activeFilters).flatMap(([fieldKey, val]) => {
          // Text input fields don't use the optimistic checkbox map
          if (TEXT_INPUT_FACET_FIELDS.has(fieldKey)) return [];
          return ((val as string[] | undefined) ?? []).map((v) => [
            `${s.groupKey}:${fieldKey}:${v}`,
            false,
          ]);
        });
      }),
    );
    setOptimistic(allUnchecked);
    startTransition(() => {
      onSetFilters({ ...reset, page: 1 });
    });
  };

  if (!allFacetsData.data) return null;

  return (
    <div>
      <PanelHeader
        hasAnyFilter={hasAnyFilter}
        onResetAll={handleResetAll}
        onClose={onClose}
      />

      {sections.map((section) => {
        if (section.type === "checkbox-facets") {
          return (
            <CheckboxFacetsSection
              key={section.groupKey}
              groupKey={section.groupKey}
              activeFilters={section.activeFilters}
              allFacets={allFacetsData.data}
              facetCounts={facetCounts}
              isFetching={isFetching}
              optimistic={optimistic}
              setOptimistic={setOptimistic}
              onToggleArrayFilter={onToggleArrayFilter}
              onSetFilters={onSetFilters}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

// === Internal sub-components ===

function PanelHeader({
  hasAnyFilter,
  onResetAll,
  onClose,
}: {
  hasAnyFilter: boolean;
  onResetAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3">
      <span className="text-sm font-medium">Filters</span>
      <div className="flex items-center gap-1">
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="slim"
            className="text-xs text-muted-foreground"
            onClick={onResetAll}
          >
            Reset all
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onClose}>
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Debounced text input for partial-match string facet fields (e.g. "disease").
 * Keeps a local input value and only calls onSetFilters after DEBOUNCE_MS of inactivity.
 */
function DiseaseTextFilter({
  groupKey,
  fieldKey,
  activeFilters,
  onSetFilters,
}: {
  groupKey: string;
  fieldKey: string;
  activeFilters: DatasetFilters;
  onSetFilters: (partial: Record<string, unknown>) => void;
}) {
  const committedValue =
    (activeFilters[fieldKey as keyof typeof activeFilters] as
      | string
      | undefined) ?? "";

  const [localValue, setLocalValue] = useState(committedValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when the URL state changes externally (e.g. "Reset all")
  useEffect(() => {
    setLocalValue(committedValue);
  }, [committedValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const { [fieldKey as keyof typeof activeFilters]: _, ...rest } =
        activeFilters;
      const newFilters =
        next.trim() !== ""
          ? { ...activeFilters, [fieldKey]: next.trim() }
          : Object.keys(rest).length > 0
            ? rest
            : undefined;
      startTransition(() => {
        onSetFilters({ [groupKey]: newFilters, page: 1 });
      });
    }, DEBOUNCE_MS);
  };

  return (
    <Input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder="Search disease…"
      className={cn("h-7 text-sm")}
    />
  );
}

function CheckboxFacetsSection({
  groupKey,
  activeFilters,
  allFacets,
  facetCounts,
  isFetching,
  optimistic,
  setOptimistic,
  onToggleArrayFilter,
  onSetFilters,
}: {
  groupKey: string;
  activeFilters: DatasetFilters;
  allFacets: Record<string, { value: string; count: number }[]>;
  facetCounts?: Record<string, { value: string; count: number }[]>;
  isFetching: boolean;
  optimistic: Record<string, boolean>;
  setOptimistic: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onToggleArrayFilter: (
    groupKey: string,
    fieldKey: string,
    value: string,
    checked: boolean,
  ) => void;
  onSetFilters: (partial: Record<string, unknown>) => void;
}) {
  const resetGroup = (fieldKey: string) => {
    const { [fieldKey as keyof typeof activeFilters]: _, ...rest } =
      activeFilters;
    const cleaned = Object.keys(rest).length > 0 ? rest : undefined;
    // Only update optimistic checkbox state for array fields, not text input fields
    if (!TEXT_INPUT_FACET_FIELDS.has(fieldKey)) {
      const activeValues =
        (activeFilters[fieldKey as keyof typeof activeFilters] as
          | string[]
          | undefined) ?? [];
      setOptimistic((prev) => ({
        ...prev,
        ...Object.fromEntries(
          activeValues.map((v) => [`${groupKey}:${fieldKey}:${v}`, false]),
        ),
      }));
    }
    startTransition(() => {
      onSetFilters({ [groupKey]: cleaned, page: 1 });
    });
  };

  return (
    <Accordion
      type="multiple"
      className="px-3"
      defaultValue={Object.keys(activeFilters)}
    >
      {Object.entries(allFacets).map(([fieldKey, values]) => {
        const isTextInputField = TEXT_INPUT_FACET_FIELDS.has(fieldKey);
        const activeValue = activeFilters[fieldKey as keyof typeof activeFilters];
        const hasActiveValue = isTextInputField
          ? (activeValue as string | undefined) != null &&
            (activeValue as string) !== ""
          : ((activeValue as string[] | undefined) ?? []).length > 0;

        return (
          <AccordionItem
            key={fieldKey}
            value={fieldKey}
            className="border-b-primary-translucent relative"
          >
            <AccordionTrigger className="text-secondary font-bold">
              <span>{fieldKey}</span>
            </AccordionTrigger>
            {hasActiveValue && (
              <button
                type="button"
                className="absolute right-6 top-0 z-10 h-10 px-0 text-xs text-muted-foreground"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  resetGroup(fieldKey);
                }}
              >
                Reset
              </button>
            )}
            <AccordionContent className="pl-5 py-1">
              {isTextInputField ? (
                <DiseaseTextFilter
                  groupKey={groupKey}
                  fieldKey={fieldKey}
                  activeFilters={activeFilters}
                  onSetFilters={onSetFilters}
                />
              ) : (
                <ul className="space-y-2">
                  {values.map((val) => {
                    const optimisticKey = `${groupKey}:${fieldKey}:${val.value}`;
                    const urlActive = (
                      (activeFilters[fieldKey as keyof typeof activeFilters] as
                        | string[]
                        | undefined) ?? []
                    ).includes(val.value);
                    const isChecked =
                      optimisticKey in optimistic
                        ? optimistic[optimisticKey]
                        : urlActive;

                    const count =
                      facetCounts?.[fieldKey]?.find(
                        (f) => f.value === val.value,
                      )?.count ?? 0;

                    return (
                      <li key={`${fieldKey}-${val.value}`}>
                        <Label className="flex justify-between items-start">
                          <span>
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                setOptimistic((prev) => ({
                                  ...prev,
                                  [optimisticKey]: !!checked,
                                }));
                                startTransition(() => {
                                  onToggleArrayFilter(
                                    groupKey,
                                    fieldKey,
                                    val.value,
                                    !!checked,
                                  );
                                });
                              }}
                            />
                            <span
                              className={cn("ml-2", {
                                "opacity-40": isFetching,
                              })}
                            >
                              {val.value}
                            </span>
                          </span>
                          <span>{count}</span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
