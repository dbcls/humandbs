import { Link, useLocation } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { cleanEmptyParams } from "@/utils/clean-empty-params";
import type { DatasetListQueryParams, ResearchesSearchParams } from "@/utils/query-params";

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

export function ResearchDatasetTabs() {
  const tCommon = useTranslations("common");
  const location = useLocation();

  const pathname = location.pathname;
  const isResearch = pathname.includes("/research");
  const isDataset = pathname.includes("/dataset");

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
      elements.forEach((el) => {
        observer.observe(el);
      });
      observers.push(observer);
    }

    return () => {
      clearTimeout(timer);
      observers.forEach((obs) => {
        obs.disconnect();
      });
    };
  }, [currentPlace]);

  if (!isResearch && !isDataset) return null;

  return (
    <nav
      aria-label={`${tCommon("research")} / ${tCommon("dataset")}`}
      className="relative flex gap-2 rounded-full border border-gray-100 bg-white p-2"
    >
      {/* 研究タブ */}
      <Link
        to="/{-$lang}/research"
        search={switchSearch.research as ResearchesSearchParams}
        ref={researchRef}
        className={cn(
          "z-10 flex h-10 cursor-pointer items-center justify-center rounded-full px-8 text-center font-bold text-foreground-light text-sm uppercase no-underline transition-all duration-200",
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
          "z-10 flex h-10 cursor-pointer items-center justify-center rounded-full px-8 text-center font-bold text-foreground-light text-sm uppercase no-underline transition-all duration-200",
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
        className="pointer-events-none absolute top-2 z-0 h-10 rounded-full bg-secondary transition-all duration-300 ease-out"
        aria-hidden="true"
        style={{
          left: `${sliderStyle.left}px`,
          width: `${sliderStyle.width}px`,
        }}
      />
    </nav>
  );
}
