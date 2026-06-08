import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";
import { cleanEmptyParams } from "@/utils/clean-empty-params";
import type { ResearchesSearchParams, DatasetListQueryParams } from "@/utils/query-params";

const researchSorts = new Set([
  "humId",
  "title",
  "releaseDate",
  "datePublished",
  "dateModified",
  "relevance",
]);
const datasetSorts = new Set(["datasetId", "releaseDate", "relevance"]);

function isStringInSet(value: unknown, set: Set<string>): value is string {
  return typeof value === "string" && set.has(value);
}

function buildTableSwitchSearch(
  currentSearch: Record<string, unknown>,
  target: "dataset" | "research",
) {
  if (target === "research") {
    return {
      page: 1,
      limit: currentSearch.limit,
      sort: isStringInSet(currentSearch.sort, researchSorts) ? currentSearch.sort : undefined,
      order: currentSearch.order,
      query: currentSearch.query,
      datePublished: currentSearch.datePublished,
      dateModified: currentSearch.dateModified,
      datasetFilters: currentSearch.datasetFilters ?? currentSearch.filters,
    };
  }

  return {
    page: 1,
    limit: currentSearch.limit,
    sort: isStringInSet(currentSearch.sort, datasetSorts) ? currentSearch.sort : undefined,
    order: currentSearch.order,
    query: currentSearch.query,
    humId: currentSearch.humId,
    filters: currentSearch.filters ?? currentSearch.datasetFilters,
  };
}

function getTableSwitchSearch(currentSearch: Record<string, unknown>) {
  return {
    research: cleanEmptyParams(buildTableSwitchSearch(currentSearch, "research")),
    dataset: cleanEmptyParams(buildTableSwitchSearch(currentSearch, "dataset")),
  };
}

const tab = cva(
  [
    "relative flex cursor-pointer select-none items-end px-8 pb-1",
    "rounded-tr-md font-bold text-sm no-underline",
    "border-gray-200 border-t border-r",
    "before:absolute before:-top-px before:bottom-0 before:-left-[14px] before:w-[14px]",
    "before:border-gray-200 before:border-t before:border-l",
    "before:origin-bottom-right before:skew-x-[-25deg] before:rounded-tl-md",
  ],
  {
    variants: {
      active: {
        true: [
          "z-10 h-[30px] bg-white text-secondary visited:text-secondary",
          "border-b border-b-white shadow-[0_-2px_3px_rgba(0,0,0,0.02)]",
          "before:border-b before:border-b-white before:bg-white",
        ],
        false: [
          "z-0 h-[29px] -translate-y-px bg-gray-100/90 text-muted-foreground visited:text-secondary",
          "border-b border-b-gray-200 shadow-[inset_0_-3px_5px_-1px_rgba(0,0,0,0.06)]",
          "hover:bg-gray-50 hover:before:bg-gray-50",
          "before:border-b before:border-b-gray-200 before:bg-gray-100/90",
          "before:shadow-[inset_0_-3px_5px_-1px_rgba(0,0,0,0.06)]",
        ],
      },
    },
  },
);

export function ResearchDatasetTabs() {
  const tCommon = useTranslations("common");
  const location = useLocation();

  const pathname = location.pathname;
  const isResearch = pathname.includes("/research");
  const isDataset = pathname.includes("/dataset");

  if (!isResearch && !isDataset) return null;

  const currentPlace: "research" | "dataset" = isResearch ? "research" : "dataset";
  const switchSearch = getTableSwitchSearch(location.search as Record<string, unknown>);

  const researchRef = useRef<HTMLAnchorElement>(null);
  const datasetRef = useRef<HTMLAnchorElement>(null);
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const updateSlider = () => {
      const activeEl = currentPlace === "research" ? researchRef.current : datasetRef.current;
      if (activeEl) {
        setSliderStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
        });
      }
    };

    const timer = setTimeout(updateSlider, 50);

    const observers: ResizeObserver[] = [];
    const elements = [researchRef.current, datasetRef.current].filter(Boolean) as HTMLElement[];
    if (elements.length > 0) {
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(updateSlider);
      });
      elements.forEach((el) => observer.observe(el));
      observers.push(observer);
    }

    return () => {
      clearTimeout(timer);
      observers.forEach((obs) => obs.disconnect());
    };
  }, [currentPlace]);

  return (
    <nav
      aria-label={`${tCommon("research")} / ${tCommon("dataset")}`}
      className="relative flex rounded-full bg-white p-2 gap-2 border border-gray-100"
    >
      {/* 研究タブ */}
      <Link
        to="/{-$lang}/research"
        search={switchSearch.research as ResearchesSearchParams}
        ref={researchRef}
        className={cn(
          "z-10 h-10 px-8 cursor-pointer rounded-full text-center flex items-center justify-center font-bold text-sm text-foreground-light uppercase transition-all duration-200 no-underline",
          {
            "text-white": currentPlace === "research",
            "bg-transparent hover:text-foreground": currentPlace !== "research",
          },
        )}
      >
        <span
          className={cn(
            "inline-block",
            currentPlace === "research" ? "translate-y-px" : "translate-y-[2px]",
          )}
        >
          {tCommon("research")}
        </span>
      </Link>

      {/* データセットタブ */}
      <Link
        to="/{-$lang}/dataset"
        search={switchSearch.dataset as DatasetListQueryParams}
        ref={datasetRef}
        className={cn(
          "z-10 h-10 px-8 cursor-pointer rounded-full text-center flex items-center justify-center font-bold text-sm text-foreground-light uppercase transition-all duration-200 no-underline",
          {
            "text-white": currentPlace === "dataset",
            "bg-transparent hover:text-foreground": currentPlace !== "dataset",
          },
        )}
      >
        <span
          className={cn(
            "inline-block",
            currentPlace === "dataset" ? "translate-y-px" : "translate-y-[2px]",
          )}
        >
          {tCommon("dataset")}
        </span>
      </Link>

      <div
        className="absolute z-0 top-2 h-10 rounded-full bg-secondary transition-all duration-300 ease-out pointer-events-none"
        aria-hidden="true"
        style={{
          left: `${sliderStyle.left}px`,
          width: `${sliderStyle.width}px`,
        }}
      />
    </nav>
  );
}
