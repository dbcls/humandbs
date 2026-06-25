import { Link, useLocation } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";
import { cleanEmptyParams } from "@/utils/clean-empty-params";
import type { DatasetListQueryParams, ResearchesSearchParams } from "@/utils/query-params";

const researchSorts = new Set(["humId", "datePublished", "dateModified"]);
const datasetSorts = new Set(["datasetId", "releaseDate"]);

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

  if (!isResearch && !isDataset) return null;

  const currentPlace: "research" | "dataset" = isResearch ? "research" : "dataset";
  const switchSearch = getTableSwitchSearch(location.search as Record<string, unknown>);

  // スタイルの共通定義（左が斜め、右が垂直の台形タブ）
  const baseTabClass =
    "relative px-8 flex items-end pb-1 border-t border-r border-gray-200 transition-all duration-200 cursor-pointer font-bold text-sm select-none rounded-tr-md no-underline";
  const skewBeforeClass =
    "before:content-[''] before:absolute before:top-[-1px] before:bottom-0 before:-left-[14px] before:w-[14px] before:border-t before:border-l before:border-gray-200 before:rounded-tl-md before:skew-x-[-25deg] before:origin-bottom-right before:transition-all before:duration-200";

  // Active / Inactive 用のクラス
  const activeClass =
    "h-[30px] bg-white text-secondary visited:text-secondary hover:text-secondary z-10 border-b border-b-white before:bg-white before:border-b before:border-b-white shadow-[0_-2px_3px_rgba(0,0,0,0.02)]";
  const inactiveClass =
    "h-[29px] -translate-y-[1px] bg-gray-100/90 text-muted-foreground visited:text-muted-foreground hover:text-muted-foreground hover:bg-gray-50 hover:before:bg-gray-50 z-0 border-b border-b-gray-200 before:bg-gray-100/90 before:border-b before:border-b-gray-200 shadow-[inset_0_-3px_5px_-1px_rgba(0,0,0,0.06)] before:shadow-[inset_0_-3px_5px_-1px_rgba(0,0,0,0.06)]";

  return (
    <nav
      aria-label={`${tCommon("research")} / ${tCommon("dataset")}`}
      className="flex items-end pl-6 mr-[-1px]"
    >
      {/* 研究タブ */}
      <Link
        to="/{-$lang}/research"
        search={switchSearch.research as ResearchesSearchParams}
        aria-current={currentPlace === "research" ? "page" : undefined}
        className={cn(
          baseTabClass,
          skewBeforeClass,
          currentPlace === "research" ? activeClass : inactiveClass,
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
        aria-current={currentPlace === "dataset" ? "page" : undefined}
        className={cn(
          baseTabClass,
          skewBeforeClass,
          "-ml-1.5", // タブの重なり
          currentPlace === "dataset" ? activeClass : inactiveClass,
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
    </nav>
  );
}
