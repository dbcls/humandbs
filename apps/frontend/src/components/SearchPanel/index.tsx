import type { RangeFilter } from "@humandbs/backend/types";
import { ChevronRight } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslations } from "use-intl";

import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { BooleanFacetItem } from "./BooleanFacetItem";
import { CheckboxFacetItem } from "./CheckboxFacetItem";
import { EnumFacetItem } from "./EnumFacetItem";
import { RangeFacetItem } from "./RangeFacetItem";
import { TextFacetItem } from "./TextFacetItem";
import { TextListFacetItem } from "./TextListFacetItem";
import { isNestedConfig } from "./types";
import type { DraftState, SearchPanelProps, SectionConfig } from "./types";

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

function PanelHeader({
  hasAnyFilter,
  onReset,
}: {
  onReset: () => void;
  hasAnyFilter: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Filters");
  if (!hasAnyFilter) return null;
  return (
    <div className="bg-secondary/10 flex justify-end p-2 pb-[3px]">
      <Button
        variant="tableAction"
        className="h-[21px] px-2 text-[10px]"
        onClick={onReset}
      >
        {t("panel-reset-all")}
      </Button>
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
          key={section.id}
          id={section.id}
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
          inputType="number"
        />
      );
    case "date-range":
    case "date-range-filter":
      return (
        <RangeFacetItem
          key={section.id}
          id={section.id}
          draftValue={(draft[section.id] as RangeFilter | undefined) ?? {}}
          onUpdate={onUpdate}
          inputType="date"
        />
      );
    default:
      return null;
  }
}

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

  useEffect(() => {
    setDraft(committedDraft);
  }, [committedDraft]);

  const hasAnyFilter = hasAnyDraftValue(draft);

  const updateDraftField = (id: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [id]: value }));
  };

  function handleResetAll() {
    setDraft(Object.fromEntries(sections.map((s) => [s.id, undefined])));
  }

  const handleSearch = () => {
    const payload = buildPayload(sections, draft);

    startTransition(() => {
      onSetFilters({ ...payload, page: 1 });
    });
  };

  const groupedSections = sections.reduce((acc, curr) => {
    const displayKey =
      "uiGroup" in curr && curr.uiGroup ? curr.uiGroup : "top-level";
    if (!acc[displayKey]) acc[displayKey] = [];
    acc[displayKey].push(curr);
    return acc;
  }, {} as GroupedSections);

  const [openSections, setOpenSections] = useState<string[]>([]);
  const [openFacets, setOpenFacets] = useState<Record<string, string[]>>({});

  useEffect(() => {
    try {
      const savedSections = localStorage.getItem("searchPanel_openSections");
      if (savedSections) setOpenSections(JSON.parse(savedSections));

      const savedFacets = localStorage.getItem("searchPanel_openFacets");
      if (savedFacets) setOpenFacets(JSON.parse(savedFacets));
    } catch (e) {
      console.error("Failed to load searchPanel local storage", e);
    }
  }, []);

  const handleSectionToggle = (
    key: string,
    isOpen: boolean,
    val: SectionConfig[],
  ) => {
    const nextSections = isOpen
      ? [...openSections, key]
      : openSections.filter((k) => k !== key);
    setOpenSections(nextSections);
    localStorage.setItem(
      "searchPanel_openSections",
      JSON.stringify(nextSections),
    );

    if (isOpen) {
      const nextFacets = { ...openFacets, [key]: val.map((s) => s.id) };
      setOpenFacets(nextFacets);
      localStorage.setItem(
        "searchPanel_openFacets",
        JSON.stringify(nextFacets),
      );
    }
  };

  const getActiveFacets = (val: SectionConfig[]) => {
    return val
      .filter((s) => normalizeValue(draft[s.id]) !== undefined)
      .map((s) => s.id);
  };

  useEffect(() => {
    const timeout = setTimeout(handleSearch, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [draft]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        hasAnyFilter={hasAnyFilter}
        onReset={handleResetAll}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedSections).map(([key, val]) => {
          const isTopLevel = key === "top-level";
          const isSectionOpen = isTopLevel || openSections.includes(key);

          return (
            <Collapsible
              key={key}
              open={isSectionOpen}
              onOpenChange={(isOpen) => {
                if (!isTopLevel) handleSectionToggle(key, isOpen, val);
              }}
              asChild
            >
              <section className="border-b border-gray-400 last:border-b-0">
                {!isTopLevel && (
                  <CollapsibleTrigger asChild>
                    <div className="group sticky top-0 z-20 flex cursor-pointer items-center justify-between bg-[#e8eff8] px-5 py-2.5 transition-colors hover:bg-[#d1dff2]">
                      <h3 className="text-secondary-foreground text-sm font-bold">
                        {t(key as any)}
                      </h3>
                      <ChevronRight className="text-secondary-foreground h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                    </div>
                  </CollapsibleTrigger>
                )}

                <CollapsibleContent className="px-4">
                  <Accordion
                    className="px-1 pt-[2px] pb-4"
                    type="multiple"
                    value={openFacets[key] ?? getActiveFacets(val)}
                    onValueChange={(newVal) => {
                      const nextFacets = { ...openFacets, [key]: newVal };
                      setOpenFacets(nextFacets);
                      localStorage.setItem(
                        "searchPanel_openFacets",
                        JSON.stringify(nextFacets),
                      );
                    }}
                  >
                    {val.map((v, i) => (
                      <AccordionFilterItem
                        key={v.id || `${v.groupKey}-${i}`}
                        section={v}
                        facetCounts={facetCounts}
                        onUpdate={updateDraftField}
                        isFetching={isFetching}
                        draft={draft}
                      />
                    ))}
                  </Accordion>
                </CollapsibleContent>
              </section>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

export * from "./types";
