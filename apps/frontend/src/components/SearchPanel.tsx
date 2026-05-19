import type { DatasetFilters, RangeFilter } from "@humandbs/backend/types";
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "use-intl";

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
import type { FACET_TYPES } from "@/config/facet-config";

// === Section config types ===

type StringArrayKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string[] ? K : never;
}[keyof T];

type StringKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string ? K : never;
}[keyof T];

type PlainStringKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string
    ? string extends NonNullable<T[K]>
      ? K
      : never
    : never;
}[keyof T];

type StringEnumKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string
    ? string extends NonNullable<T[K]>
      ? never
      : K
    : never;
}[keyof T];

type BooleanKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends boolean ? K : never;
}[keyof T];

type RangeKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends RangeFilter ? K : never;
}[keyof T];

type GenericFacetConfig<K extends keyof DatasetFilters> = {
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
}

export interface DateRangeFilterConfig {
  type: "date-range-filter";
  id: string;
  value: RangeFilter;
  groupKey?: string;
}

export interface TextFilterConfig {
  type: "text-filter";
  id: string;
  value: string;
  groupKey?: string;
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

// === Helper: check if a section has a groupKey (facet configs do, top-level filters don't) ===

function isNestedConfig(
  section: SectionConfig,
): section is SectionConfig & { groupKey: string } {
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

    if (isNestedConfig(section)) {
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

type GroupedSections = Record<"top-level" | (string & {}), SectionConfig[]>;

// === Main component ===

export function SearchPanel({
  sections,
  onClose,
  isFetching,
  facetCounts,
  onSetFilters,
}: SearchPanelProps) {
  const t = useTranslations("Filters");

  const committedDraft = useMemo(() => buildDraftState(sections), [sections]);

  const [draft, setDraft] = useState<DraftState>(committedDraft);
  const hasUserDraftChangeRef = useRef(false);

  useEffect(() => {
    setDraft(committedDraft);
  }, [committedDraft]);

  const hasAnyFilter = hasAnyDraftValue(draft);

  const updateDraftField = (id: string, value: unknown) => {
    hasUserDraftChangeRef.current = true;
    setDraft((prev) => ({ ...prev, [id]: value }));
  };

  function handleResetAll() {
    hasUserDraftChangeRef.current = true;
    setDraft(Object.fromEntries(sections.map((s) => [s.id, undefined])));
  }

  const handleSearch = () => {
    const payload = buildPayload(sections, draft);

    startTransition(() => {
      onSetFilters({ ...payload, page: 1 });
    });
    hasUserDraftChangeRef.current = false;
  };

  const groupedSections = sections.reduce((acc, curr) => {
    const displayKey =
      "uiGroup" in curr && curr.uiGroup ? curr.uiGroup : "top-level";
    if (!acc[displayKey]) acc[displayKey] = [];
    acc[displayKey].push(curr);
    return acc;
  }, {} as GroupedSections);

  useEffect(() => {
    if (!hasUserDraftChangeRef.current) return;

    const timeout = setTimeout(handleSearch, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [draft]);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        hasAnyFilter={hasAnyFilter}
        onReset={handleResetAll}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedSections).map(([key, val]) => {
          if (key === "top-level") {
            return (
              <Accordion
                className="px-3 pb-2"
                type="multiple"
                key={key}
                defaultValue={val
                  .filter((s) => normalizeValue(draft[s.id]) !== undefined)
                  .map((s) => s.id)}
              >
                {val.map((v, i) => (
                  <AccordionFilterItem
                    key={`${v.groupKey}-${i}`}
                    section={v}
                    facetCounts={facetCounts}
                    onUpdate={updateDraftField}
                    isFetching={isFetching}
                    draft={draft}
                  />
                ))}
              </Accordion>
            );
          } else {
            return (
              <Accordion
                className="mt-6 px-3 pb-2"
                type="multiple"
                key={key}
                defaultValue={val
                  .filter((s) => normalizeValue(draft[s.id]) !== undefined)
                  .map((s) => s.id)}
              >
                <p className="py-3 text-sm font-medium">{t(key as any)}</p>
                {val.map((v) => (
                  <AccordionFilterItem
                    key={v.id}
                    section={v}
                    facetCounts={facetCounts}
                    onUpdate={updateDraftField}
                    isFetching={isFetching}
                    draft={draft}
                  />
                ))}
              </Accordion>
            );
          }
        })}
      </div>
    </div>
  );
}

// === Internal sub-components ===

function PanelHeader({
  hasAnyFilter,
  onClose,
  onReset,
}: {
  onReset: () => void;
  hasAnyFilter: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Filters");
  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ChevronRight className="size-6" />
        </Button>
        <span className="text-sm font-medium">{t("panel-title")}</span>
        <div className="flex items-center gap-1">
          {hasAnyFilter && (
            <Button
              variant="outline"
              size="slim"
              className="text-2xs text-muted-foreground py-0"
              onClick={onReset}
            >
              {t("panel-reset-all")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AccordionFilterItem({
  section,
  onUpdate,
  draft,
  facetCounts,
  isFetching,
}: {
  section: SectionConfig;
  onUpdate: (id: string, value: any) => void;
  draft: DraftState;
  facetCounts: Record<string, { value: string; count: number }[]> | undefined;
  isFetching: boolean;
}) {
  switch (section.type) {
    case "checkbox":
      return (
        <CheckboxFacetItem
          key={section.id}
          id={section.id}
          draftValue={draft[section.id]}
          onUpdate={onUpdate}
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
          onUpdate={onUpdate}
        />
      );
    case "text-filter":
      return (
        <TextFacetItem
          key={section.id}
          id={section.id}
          draftValue={(draft[section.id] as string) ?? ""}
          onUpdate={onUpdate}
        />
      );
    case "boolean":
      return (
        <BooleanFacetItem
          key={section.id}
          id={section.id}
          draftValue={draft[section.id] as boolean | undefined}
          onUpdate={onUpdate}
          facetCounts={facetCounts?.[section.id]}
        />
      );
    case "enum":
      return (
        <EnumFacetItem
          id={section.id}
          key={section.id}
          draftValue={draft[section.id] as string}
          onUpdate={onUpdate}
          options={section.options}
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
          onUpdate={onUpdate}
        />
      );
    case "range":
    case "range-filter":
      return (
        <RangeFacetItem
          key={section.id}
          id={section.id}
          draftValue={(draft[section.id] as RangeFilter | undefined) ?? {}}
          onUpdate={onUpdate}
        />
      );
    case "date-range":
    case "date-range-filter":
      return (
        <DateRangeFacetItem
          key={section.id}
          id={section.id}
          draftValue={(draft[section.id] as RangeFilter | undefined) ?? {}}
          onUpdate={onUpdate}
        />
      );
    default:
      return null;
  }
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
  const tFilters = useTranslations("Filters");

  const t = useTranslations(`Filters.${id}` as any);

  return (
    <AccordionItem value={id} className="border-b-primary-translucent relative">
      <AccordionTrigger className="text-secondary font-bold">
        <span>{t("title" as any)}</span>
      </AccordionTrigger>
      {hasValue && (
        <Button
          variant={"outline"}
          size={"slim"}
          className="text-2xs text-muted-foreground absolute top-1 right-0 z-10 py-0"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
        >
          {tFilters("panel-reset")}
        </Button>
      )}
      <AccordionContent className="py-1 pl-5">{children}</AccordionContent>
    </AccordionItem>
  );
}

type CheckboxSortMode = "name" | "count";
type CheckboxSortDir = "asc" | "desc" | undefined;

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: CheckboxSortDir;
  onClick: () => void;
}) {
  const Icon =
    dir === "asc" ? ChevronUp : dir === "desc" ? ChevronDown : ChevronsUpDown;
  return (
    <div>
      <Button
        type="button"
        onClick={onClick}
        variant={"ghost"}
        size={"slim"}
        className={"hover:bg-hover font-normal"}
      >
        {label}
        <Icon className={cn("size-4", active ? "opacity-100" : "opacity-40")} />
      </Button>
    </div>
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
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<CheckboxSortMode>("count");
  const [sortDir, setSortDir] = useState<CheckboxSortDir>("desc");

  const t = useTranslations(`Filters.${id}.options` as any);
  const tFilters = useTranslations("Filters");

  if (options.length === 0) return null;

  const getLabel = (optionValue: string): string => {
    try {
      const translated = t(optionValue as any);
      if (typeof translated === "string") return translated;
    } catch {
      // fall through to raw value
    }
    return optionValue;
  };

  const handleSortClick = (mode: CheckboxSortMode) => {
    if (sortMode === mode) {
      setSortDir((d) =>
        d === "asc" ? "desc" : d === "desc" ? undefined : "asc",
      );
    } else {
      setSortMode(mode);
      setSortDir(mode === "count" ? "desc" : "asc");
    }
  };

  const showSearch = options.length > 9;

  const filteredOptions =
    showSearch && search.trim()
      ? options.filter((optionValue) => {
          const q = search.trim().toLowerCase();
          if (optionValue.toLowerCase().includes(q)) return true;
          return getLabel(optionValue).toLowerCase().includes(q);
        })
      : [...options];

  filteredOptions.sort((a, b) => {
    let cmp: number;
    if (sortMode === "name") {
      cmp = getLabel(a).localeCompare(getLabel(b));
    } else {
      const countA = facetCounts?.find((f) => f.value === a)?.count ?? 0;
      const countB = facetCounts?.find((f) => f.value === b)?.count ?? 0;
      cmp = countA - countB;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      {showSearch && (
        <Input
          className="mb-2 h-7 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
        />
      )}
      <div className="text-muted-foreground mb-1 flex items-center justify-between gap-2 text-xs">
        <SortButton
          label={tFilters("sort-by-name")}
          active={sortMode === "name" && !!sortDir}
          dir={sortMode === "name" ? sortDir : "asc"}
          onClick={() => handleSortClick("name")}
        />
        <SortButton
          label={tFilters("sort-by-count")}
          active={sortMode === "count" && !!sortDir}
          dir={sortMode === "count" ? sortDir : "desc"}
          onClick={() => handleSortClick("count")}
        />
      </div>
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {filteredOptions.map((optionValue) => {
          const isChecked = selectedValues.includes(optionValue);
          const count =
            facetCounts?.find((f) => f.value === optionValue)?.count ?? 0;

          return (
            <li key={`${id}-${optionValue}`}>
              <Label className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 text-xs">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    const nextValues =
                      checked === true
                        ? Array.from(new Set([...selectedValues, optionValue]))
                        : selectedValues.filter((v) => v !== optionValue);

                    onUpdate(
                      id,
                      nextValues.length > 0 ? nextValues : undefined,
                    );
                  }}
                />
                <span
                  className={cn({
                    "opacity-40": isFetching,
                  })}
                >
                  {getLabel(optionValue)}
                </span>
                <span className="text-muted-foreground">{count}</span>
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
        className="h-7 text-sm"
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

  const realOptions = ["any", "true", "false"];

  const t = useTranslations(`Filters.${id}.options` as any);

  return (
    <FacetItemWrapper
      id={id}
      hasValue={isEnabled}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div className="space-y-2">
        <RadioGroup
          className="pl-6"
          value={String(draftValue)}
          onValueChange={(val) => {
            if (val === "any") {
              onUpdate(id, undefined);
              return;
            }
            onUpdate(id, val === "true");
          }}
        >
          {realOptions.map((option) => (
            <Label
              key={option}
              className="flex items-center justify-between gap-2"
            >
              <span>
                <RadioGroupItem value={option} />
                <span className="ml-2">{t(option as any)}</span>
              </span>
              <span>
                {option !== "any"
                  ? facetCounts?.find(
                      (f) => f.value === (option === "true" ? "1" : "0"),
                    )?.count || 0
                  : null}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </FacetItemWrapper>
  );
}

function EnumFacetItem({
  id,
  options,
  draftValue,
  onUpdate,
}: {
  id: string;
  options: string[];
  draftValue: string | undefined;
  onUpdate: (id: string, value: unknown) => void;
}) {
  const t = useTranslations(`Filters.${id}.options` as any);

  const realOptions = ["any", ...options];
  const isEnabled = draftValue != null && draftValue !== "any";

  return (
    <FacetItemWrapper
      id={id}
      hasValue={isEnabled}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div>
        <RadioGroup
          value={draftValue || "any"}
          onValueChange={(val) => {
            if (val === "any") {
              onUpdate(id, undefined);
              return;
            }
            onUpdate(id, val);
          }}
        >
          {realOptions.map((option) => (
            <Label key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} />
              <span>{t(option)}</span>
            </Label>
          ))}
        </RadioGroup>
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
              className={cn("h-7 flex-1 text-sm")}
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
          className="text-muted-foreground text-xs"
          onClick={handleAdd}
        >
          <Plus className="mr-1 size-3.5" />
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
