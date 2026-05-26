import { Link, useLocation } from "@tanstack/react-router";
import { cva } from "class-variance-authority";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";
import { cleanEmptyParams } from "@/utils/cleanEmptyParams";

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
    "before:absolute before:-top-px before:bottom-0 before:left-[-14px] before:w-[14px]",
    "before:border-gray-200 before:border-t before:border-l",
    "before:origin-bottom-right before:skew-x-[-25deg] before:rounded-tl-md",
  ],
  {
    variants: {
      active: {
        true: [
          "z-10 h-[30px] bg-white text-secondary",
          "border-b border-b-white shadow-[0_-2px_3px_rgba(0,0,0,0.02)]",
          "before:border-b before:border-b-white before:bg-white",
        ],
        false: [
          "z-0 h-[29px] -translate-y-px bg-gray-100/90 text-muted-foreground",
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

  return (
    <nav
      aria-label={`${tCommon("research")} / ${tCommon("dataset")}`}
      className="-mt-[5px] -mr-px flex items-end pl-6"
    >
      {/* 研究タブ */}
      <Link
        to="/{-$lang}/research"
        search={switchSearch.research}
        className={tab({ active: currentPlace === "research" })}
      >
        <span className={cn("inline-block", { "translate-y-px": currentPlace === "research" })}>
          {tCommon("research")}
        </span>
      </Link>

      {/* データセットタブ */}
      <Link
        to="/{-$lang}/dataset"
        search={switchSearch.dataset}
        className={cn("-ml-1.5", tab({ active: currentPlace === "dataset" }))}
      >
        <span className={cn("inline-block", { "translate-y-px": currentPlace === "dataset" })}>
          {tCommon("dataset")}
        </span>
      </Link>
    </nav>
  );
}
