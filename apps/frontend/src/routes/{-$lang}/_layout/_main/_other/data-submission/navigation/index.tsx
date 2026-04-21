import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { zodValidator } from "@tanstack/zod-adapter";
import { useTranslations } from "use-intl";
import { z } from "zod";

import { Card } from "@/components/Card";
import { NavigationChart, Breadcrumbs } from "@/components/NavigationChart";
import type { FlowchartAnswers, BreadcrumbItem } from "@/components/NavigationChart";
import {
  getNavigationFlowchartQueryOptions,
  getNavigationFlowchartByIdQueryOptions,
} from "@/serverFunctions/navigationFlowchart";

const ENTRY_POINT_SLUG = "/data-submission/navigation";

const answersSchema = z
  .record(z.string(), z.record(z.string(), z.string()))
  .optional()
  .default({});

const navigationSearchSchema = z.object({
  answers: answersSchema,
  // Ordered stack of child flowchart uuids navigated into (entry point is always root).
  // Last element is the currently displayed child.
  chain: z.array(z.string()).optional().default([]),
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/navigation/",
)({
  validateSearch: zodValidator(navigationSearchSchema),
  component: RouteComponent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      getNavigationFlowchartQueryOptions(ENTRY_POINT_SLUG, context.lang),
    ),
});

function RouteComponent() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { lang } = Route.useRouteContext();
  const { answers, chain } = Route.useSearch();
  const t = useTranslations("Data-submission");

  // The currently displayed flowchart: last in chain, or the entry point
  const currentChildId = chain.length > 0 ? chain[chain.length - 1] : null;

  // Load entry point metadata
  const { data: entryPointData } = useQuery(
    getNavigationFlowchartQueryOptions(ENTRY_POINT_SLUG, lang),
  );

  // Load metadata for every id in the chain (for breadcrumb names + caption)
  const chainQueries = useQueries({
    queries: chain.map((id) => ({
      ...getNavigationFlowchartByIdQueryOptions(id, lang),
    })),
  });

  // Build the full breadcrumb trail: entry point + each chain item
  // The last item is the current location (non-clickable tip).
  const allItems: (BreadcrumbItem & { childDepth: number | null })[] = [
    {
      slug: ENTRY_POINT_SLUG,
      nameEn: entryPointData?.nameEn ?? "Navigation",
      nameJa: entryPointData?.nameJa ?? "ナビゲーション",
      childDepth: null, // entry point = go back to no chain
    },
    ...chain.map((id, idx) => {
      const data = chainQueries[idx]?.data;
      return {
        slug: id,
        nameEn: data?.nameEn ?? "…",
        nameJa: data?.nameJa ?? "…",
        childDepth: idx + 1, // truncate chain to this depth
      };
    }),
  ];

  const handleAnswerChange = (slug: string, stepId: string, optionId: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        answers: {
          ...(prev.answers ?? {}),
          [slug]: {
            ...((prev.answers ?? {})[slug] ?? {}),
            [stepId]: optionId,
          },
        },
      }),
    });
  };

  const handleNavigateToChild = (linkedFlowchartId: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        chain: [...(prev.chain ?? []), linkedFlowchartId],
      }),
    });
  };

  // Navigate to a breadcrumb: truncate chain to that depth and discard
  // answers for everything deeper.
  const handleBreadcrumbClick = (childDepth: number | null) => {
    const newChain = childDepth === null ? [] : chain.slice(0, childDepth);
    // Keep only answers for flowcharts still in scope (entry point + newChain ids)
    const keepKeys = new Set([ENTRY_POINT_SLUG, ...newChain]);
    const newAnswers: FlowchartAnswers = {};
    for (const [key, val] of Object.entries(answers ?? {})) {
      if (keepKeys.has(key)) newAnswers[key] = val;
    }
    navigate({
      search: { answers: newAnswers, chain: newChain },
    });
  };

  // Breadcrumb items passed to the component — all but last are clickable
  const breadcrumbs: BreadcrumbItem[] = allItems.map((item, idx) => ({
    slug: item.slug,
    nameEn: item.nameEn,
    nameJa: item.nameJa,
    onClick: idx < allItems.length - 1
      ? () => handleBreadcrumbClick(item.childDepth)
      : undefined,
  }));

  const currentData = currentChildId
    ? chainQueries[chain.length - 1]?.data
    : null;

  const caption = currentData
    ? lang === "ja" ? currentData.nameJa : currentData.nameEn
    : t("data-submission");

  return (
    <Card caption={caption} captionSize={"lg"}>
      <Breadcrumbs items={breadcrumbs} locale={lang} />
      <NavigationChart
        slug={currentChildId ? undefined : ENTRY_POINT_SLUG}
        flowchartId={currentChildId ?? undefined}
        locale={lang}
        answers={answers ?? {}}
        onAnswerChange={handleAnswerChange}
        onNavigateToChild={handleNavigateToChild}
      />
    </Card>
  );
}
