import type { DatasetFilters, RangeFilter } from "@humandbs/backend/types";
import { Plus, Trash2, X as XIcon } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

// === Section config types ===

type StringArrayKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string[] ? K : never;
}[keyof T];

type StringKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string ? K : never;
}[keyof T];

type BooleanKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends boolean ? K : never;
}[keyof T];

type RangeKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends RangeFilter ? K : never;
}[keyof T];

export type RangeFacetConfig = {
  [K in RangeKeys<DatasetFilters>]: {
    type: "range";
    id: K;
    groupKey: string;
    value: RangeFilter;
  };
}[RangeKeys<DatasetFilters>];

export type DateRangeFacetConfig = {
  [K in RangeKeys<DatasetFilters>]: {
    type: "date-range";
    id: K;
    groupKey: string;
    value: RangeFilter;
  };
}[RangeKeys<DatasetFilters>];

export interface RangeFilterConfig {
  type: "range-filter";
  id: string;
  value: RangeFilter;
}

export interface DateRangeFilterConfig {
  type: "date-range-filter";
  id: string;
  value: RangeFilter;
}

export interface TextFilterConfig {
  type: "text-filter";
  id: string;
  value: string;
}

export type CheckboxFacetConfig = {
  [K in StringArrayKeys<DatasetFilters>]: {
    type: "checkbox";
    id: K;
    groupKey: string;
    value: NonNullable<DatasetFilters[K]>;
    options: string[];
  };
}[StringArrayKeys<DatasetFilters>];

export type TextFacetConfig = {
  [K in StringKeys<DatasetFilters>]: {
    type: "text";
    id: K;
    groupKey: string;
    value: NonNullable<DatasetFilters[K]>;
  };
}[StringKeys<DatasetFilters>];

export type BooleanFacetConfig = {
  [K in BooleanKeys<DatasetFilters>]: {
    type: "boolean";
    id: K;
    groupKey: string;
    value: DatasetFilters[K];
  };
}[BooleanKeys<DatasetFilters>];

export type TextListFacetConfig = {
  [K in StringArrayKeys<DatasetFilters>]: {
    type: "text-list";
    id: K;
    groupKey: string;
    value: NonNullable<DatasetFilters[K]>;
  };
}[StringArrayKeys<DatasetFilters>];

export type SectionConfig =
  | CheckboxFacetConfig
  | TextFacetConfig
  | BooleanFacetConfig
  | TextListFacetConfig
  | RangeFacetConfig
  | DateRangeFacetConfig
  | RangeFilterConfig
  | DateRangeFilterConfig
  | TextFilterConfig;

// === Helper: check if a section has a groupKey (facet configs do, top-level filters don't) ===

type FacetConfig =
  | CheckboxFacetConfig
  | TextFacetConfig
  | BooleanFacetConfig
  | TextListFacetConfig
  | RangeFacetConfig
  | DateRangeFacetConfig;

function isFacetConfig(section: SectionConfig): section is FacetConfig {
  return "groupKey" in section;
}

// === Props ===

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
  onSetFilters: (partial: Record<string, unknown>) => Promise<void>;
}

// === Flat draft state ===

type DraftState = Record<string, unknown>;

function buildDraftState(sections: SectionConfig[]): DraftState {
  const draft: DraftState = {};
  for (const section of sections) {
    const val = section.value;
    if (Array.isArray(val)) {
      draft[section.id] = [...val];
    } else if (val && typeof val === "object") {
      draft[section.id] = { ...val };
    } else {
      draft[section.id] = val;
    }
  }
  return draft;
}

function normalizeValue(value: unknown): unknown {
  if (value == null) return undefined;

  if (Array.isArray(value)) {
    const next = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return next.length > 0 ? Array.from(new Set(next)) : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const hasAny = Object.values(obj).some((v) => v != null);
    return hasAny ? obj : undefined;
  }

  return value;
}

function buildPayload(
  sections: SectionConfig[],
  draft: DraftState,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const groups: Record<string, Record<string, unknown>> = {};

  for (const section of sections) {
    const normalized = normalizeValue(draft[section.id]);

    if (isFacetConfig(section)) {
      const group = section.groupKey;
      if (!groups[group]) groups[group] = {};
      if (normalized !== undefined) {
        groups[group][section.id] = normalized;
      }
    } else {
      payload[section.id] = normalized;
    }
  }

  for (const [groupKey, fields] of Object.entries(groups)) {
    payload[groupKey] = Object.keys(fields).length > 0 ? fields : undefined;
  }

  return payload;
}

function hasAnyDraftValue(draft: DraftState): boolean {
  return Object.values(draft).some((v) => normalizeValue(v) !== undefined);
}

// === Main component ===

export function SearchPanel({
  sections,
  onClose,
  isFetching,
  facetCounts,
  onSetFilters,
}: SearchPanelProps) {
  const committedDraft = useMemo(() => buildDraftState(sections), [sections]);

  const [draft, setDraft] = useState<DraftState>(committedDraft);

  useEffect(() => {
    setDraft(committedDraft);
  }, [committedDraft]);

  const hasAnyFilter = hasAnyDraftValue(draft);

  const updateDraftField = (id: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [id]: value }));
  };

  const handleResetAll = () => {
    setDraft(Object.fromEntries(sections.map((s) => [s.id, undefined])));
  };

  const handleSearch = () => {
    const payload = buildPayload(sections, draft);

    startTransition(() => {
      onSetFilters({ ...payload, page: 1 });
    });
  };

  const handleResetAndApply = () => {
    const emptyDraft = Object.fromEntries(
      sections.map((s) => [s.id, undefined]),
    );
    setDraft(emptyDraft);

    const payload = buildPayload(sections, emptyDraft);
    startTransition(() => {
      onSetFilters({ ...payload, page: 1 });
    });
  };

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader
        hasAnyFilter={hasAnyFilter}
        onResetAll={handleResetAll}
        onClose={onClose}
      />

      <div className="flex-1 px-3 pb-2">
        <Accordion
          type="multiple"
          defaultValue={sections
            .filter((s) => normalizeValue(draft[s.id]) !== undefined)
            .map((s) => s.id)}
        >
          {sections.map((section) => {
            switch (section.type) {
              case "checkbox":
                return (
                  <CheckboxFacetItem
                    key={section.id}
                    id={section.id}
                    draftValue={draft[section.id]}
                    onUpdate={updateDraftField}
                    options={section.options}
                    facetCounts={facetCounts?.[section.id]}
                    isFetching={isFetching}
                  />
                );
              case "text":
                return (
                  <TextFacetItem
                    key={section.id}
                    id={section.id}
                    draftValue={(draft[section.id] as string) ?? ""}
                    onUpdate={updateDraftField}
                  />
                );
              case "text-filter":
                return (
                  <TextFacetItem
                    key={section.id}
                    id={section.id}
                    draftValue={(draft[section.id] as string) ?? ""}
                    onUpdate={updateDraftField}
                  />
                );
              case "boolean":
                return (
                  <BooleanFacetItem
                    key={section.id}
                    id={section.id}
                    draftValue={draft[section.id] as boolean | undefined}
                    onUpdate={updateDraftField}
                    facetCounts={facetCounts?.[section.id]}
                  />
                );
              case "text-list":
                return (
                  <TextListFacetItem
                    key={section.id}
                    id={section.id}
                    draftValue={
                      Array.isArray(draft[section.id])
                        ? (draft[section.id] as string[])
                        : []
                    }
                    onUpdate={updateDraftField}
                  />
                );
              case "range":
              case "range-filter":
                return (
                  <RangeFacetItem
                    key={section.id}
                    id={section.id}
                    draftValue={
                      (draft[section.id] as RangeFilter | undefined) ?? {}
                    }
                    onUpdate={updateDraftField}
                  />
                );
              case "date-range":
              case "date-range-filter":
                return (
                  <DateRangeFacetItem
                    key={section.id}
                    id={section.id}
                    draftValue={
                      (draft[section.id] as RangeFilter | undefined) ?? {}
                    }
                    onUpdate={updateDraftField}
                  />
                );
              default:
                return null;
            }
          })}
        </Accordion>
      </div>

      <PanelFooter onSearch={handleSearch} onReset={handleResetAndApply} />
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

function PanelFooter({
  onSearch,
  onReset,
}: {
  onSearch: () => void;
  onReset: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-t-primary-translucent bg-white p-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onReset}>
          Reset
        </Button>
        <Button variant="accent" onClick={onSearch}>
          Search
        </Button>
      </div>
    </div>
  );
}

function FacetItemWrapper({
  id,
  hasValue,
  onReset,
  children,
}: {
  id: string;
  hasValue: boolean;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={id} className="border-b-primary-translucent relative">
      <AccordionTrigger className="text-secondary font-bold">
        <span>{id}</span>
      </AccordionTrigger>
      {hasValue && (
        <button
          type="button"
          className="absolute right-6 top-0 z-10 h-10 px-0 text-xs text-muted-foreground"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
        >
          Reset
        </button>
      )}
      <AccordionContent className="pl-5 py-1">{children}</AccordionContent>
    </AccordionItem>
  );
}

function CheckboxFacetItem({
  id,
  draftValue,
  onUpdate,
  options,
  facetCounts,
  isFetching,
}: {
  id: string;
  draftValue: unknown;
  onUpdate: (id: string, value: unknown) => void;
  options: string[];
  facetCounts?: { value: string; count: number }[];
  isFetching: boolean;
}) {
  const selectedValues = Array.isArray(draftValue)
    ? (draftValue as string[])
    : [];
  const hasValue = selectedValues.length > 0;

  if (options.length === 0) return null;

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <ul className="space-y-2">
        {options.map((optionValue) => {
          const isChecked = selectedValues.includes(optionValue);
          const count =
            facetCounts?.find((f) => f.value === optionValue)?.count ?? 0;

          return (
            <li key={`${id}-${optionValue}`}>
              <Label className="flex justify-between items-start">
                <span>
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      const nextValues =
                        checked === true
                          ? Array.from(
                              new Set([...selectedValues, optionValue]),
                            )
                          : selectedValues.filter((v) => v !== optionValue);

                      onUpdate(
                        id,
                        nextValues.length > 0 ? nextValues : undefined,
                      );
                    }}
                  />
                  <span
                    className={cn("ml-2", {
                      "opacity-40": isFetching,
                    })}
                  >
                    {optionValue}
                  </span>
                </span>
                <span>{count}</span>
              </Label>
            </li>
          );
        })}
      </ul>
    </FacetItemWrapper>
  );
}

function TextFacetItem({
  id,
  draftValue,
  onUpdate,
}: {
  id: string;
  draftValue: string;
  onUpdate: (id: string, value: unknown) => void;
}) {
  const hasValue = draftValue.trim().length > 0;

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <Input
        type="text"
        value={draftValue}
        onChange={(e) => {
          onUpdate(id, e.target.value);
        }}
        placeholder={`Search ${id}...`}
        className={cn("h-7 text-sm")}
      />
    </FacetItemWrapper>
  );
}

function BooleanFacetItem({
  id,
  draftValue,
  onUpdate,
  facetCounts,
}: {
  id: string;
  draftValue: boolean | undefined;
  onUpdate: (id: string, value: unknown) => void;
  facetCounts?: { value: string; count: number }[];
}) {
  const isEnabled = draftValue != null;

  return (
    <FacetItemWrapper
      id={id}
      hasValue={isEnabled}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Checkbox
            checked={isEnabled}
            onCheckedChange={(checked) => {
              onUpdate(id, checked === true ? true : undefined);
            }}
          />
          <span>Filter by {id}</span>
        </Label>
        {isEnabled && (
          <RadioGroup
            className="pl-6"
            value={String(draftValue)}
            onValueChange={(val) => {
              onUpdate(id, val === "true");
            }}
          >
            <Label className="flex items-center justify-between gap-2">
              <span>
                <RadioGroupItem value="true" />
                <span className="ml-2">True</span>
              </span>
              <span>
                {facetCounts?.find((f) => f.value === "1")?.count || 0}
              </span>
            </Label>
            <Label className="flex items-center justify-between gap-2">
              <span>
                <RadioGroupItem value="false" />
                <span className="ml-2">False</span>
              </span>
              <span>
                {facetCounts?.find((f) => f.value === "0")?.count || 0}
              </span>
            </Label>
          </RadioGroup>
        )}
      </div>
    </FacetItemWrapper>
  );
}

function TextListFacetItem({
  id,
  draftValue,
  onUpdate,
}: {
  id: string;
  draftValue: string[];
  onUpdate: (id: string, value: unknown) => void;
}) {
  const hasValue = draftValue.some((v) => v.trim().length > 0);

  const handleChange = (index: number, next: string) => {
    const updated = [...draftValue];
    updated[index] = next;
    onUpdate(id, updated);
  };

  const handleRemove = (index: number) => {
    const updated = draftValue.filter((_, i) => i !== index);
    onUpdate(id, updated.length > 0 ? updated : undefined);
  };

  const handleAdd = () => {
    onUpdate(id, [...draftValue, ""]);
  };

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div className="space-y-2">
        {draftValue.map((val, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input
              type="text"
              value={val}
              onChange={(e) => {
                handleChange(index, e.target.value);
              }}
              placeholder={`${id}...`}
              className={cn("h-7 text-sm flex-1")}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => {
                handleRemove(index);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="slim"
          className="text-xs text-muted-foreground"
          onClick={handleAdd}
        >
          <Plus className="size-3.5 mr-1" />
          Add
        </Button>
      </div>
    </FacetItemWrapper>
  );
}

function RangeFacetItem({
  id,
  draftValue,
  onUpdate,
}: {
  id: string;
  draftValue: RangeFilter;
  onUpdate: (id: string, value: unknown) => void;
}) {
  const hasValue = draftValue.min != null || draftValue.max != null;

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min"
          value={draftValue.min ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(id, {
              ...draftValue,
              min: val === "" ? undefined : Number(val),
            });
          }}
          className="h-7 text-sm"
        />
        <span className="text-muted-foreground text-xs">—</span>
        <Input
          type="number"
          placeholder="Max"
          value={draftValue.max ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(id, {
              ...draftValue,
              max: val === "" ? undefined : Number(val),
            });
          }}
          className="h-7 text-sm"
        />
      </div>
    </FacetItemWrapper>
  );
}

function DateRangeFacetItem({
  id,
  draftValue,
  onUpdate,
}: {
  id: string;
  draftValue: RangeFilter;
  onUpdate: (id: string, value: unknown) => void;
}) {
  const hasValue = draftValue.min != null || draftValue.max != null;

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          type="date"
          placeholder="From"
          value={(draftValue.min as string) ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(id, {
              ...draftValue,
              min: val === "" ? undefined : val,
            });
          }}
          className="h-7 text-sm"
        />
        <span className="text-muted-foreground text-xs">—</span>
        <Input
          type="date"
          placeholder="To"
          value={(draftValue.max as string) ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(id, {
              ...draftValue,
              max: val === "" ? undefined : val,
            });
          }}
          className="h-7 text-sm"
        />
      </div>
    </FacetItemWrapper>
  );
}
