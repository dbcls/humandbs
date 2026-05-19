import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { zodValidator } from "@tanstack/zod-adapter";
import { useTranslations } from "use-intl";
import { z } from "zod";

import { Card } from "@/components/Card";
import { NavigationChart, Breadcrumbs } from "@/components/NavigationChart";
import type {
  FlowchartAnswers,
  BreadcrumbItem,
} from "@/components/NavigationChart";
import {
  getNavigationEntryPointQueryOptions,
  getNavigationFlowchartByIdQueryOptions,
} from "@/serverFunctions/navigationFlowchart";

// Stable key used to namespace entry-point answers in the URL.
// The entry point has no slug, so we use a fixed sentinel.
const ENTRY_POINT_KEY = "entry-point";

const answersSchema = z
  .record(z.string(), z.record(z.string(), z.string()))
  .optional()
  .default({});

const navigationSearchSchema = z.object({
  answers: answersSchema,
  // Ordered stack of linked flowchart uuids navigated into (entry point is always root).
  // Last element is the currently displayed linked flowchart.
  chain: z.array(z.string()).optional().default([]),
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/navigation/",
)({
  validateSearch: zodValidator(navigationSearchSchema),
  component: RouteComponent,

  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      getNavigationEntryPointQueryOptions(context.lang),
    ),
});

/**
 * Public data-submission navigation page.
 *
 * State is stored entirely in URL search params so the page is bookmarkable
 * and shareable:
 * - `answers`: nested map of { [ENTRY_POINT_KEY | linkedFlowchartUUID]: { [stepId]: optionId } }
 * - `chain`: ordered stack of linked flowchart UUIDs navigated into; the last
 *   element is the currently displayed linked flowchart.
 *
 * Breadcrumbs are built from the entry-point record + one entry per chain item.
 * The last breadcrumb (current location) is non-clickable; clicking an earlier
 * one truncates the chain to that depth and discards downstream answers.
 */
function RouteComponent() {
  const navigate = Route.useNavigate();
  const { lang } = Route.useRouteContext();
  const { answers, chain } = Route.useSearch();
  const t = useTranslations("Data-submission");

  // The currently displayed flowchart: last in chain, or the entry point
  const currentLinkedFlowchartId =
    chain.length > 0 ? chain[chain.length - 1] : null;

  // Load entry point metadata
  const { data: entryPointData } = useQuery(
    getNavigationEntryPointQueryOptions(lang),
  );

  // Load metadata for every id in the chain (for breadcrumb names + caption)
  const chainQueries = useQueries({
    queries: chain.map((id) => ({
      ...getNavigationFlowchartByIdQueryOptions(id, lang),
    })),
  });

  // Build the full breadcrumb trail: entry point + each chain item
  // The last item is the current location (non-clickable tip).
  const allItems: (BreadcrumbItem & { linkedDepth: number | null })[] = [
    {
      slug: ENTRY_POINT_KEY,
      nameEn: entryPointData?.nameEn ?? "Navigation",
      nameJa: entryPointData?.nameJa ?? "ナビゲーション",
      linkedDepth: null, // entry point = go back to no chain
    },
    ...chain.map((id, idx) => {
      const data = chainQueries[idx]?.data;
      return {
        slug: id,
        nameEn: data?.nameEn ?? "…",
        nameJa: data?.nameJa ?? "…",
        linkedDepth: idx + 1, // truncate chain to this depth
      };
    }),
  ];

  /**
   * Persists an answer to URL state. Clears `clearStepIds` from the same
   * flowchart's answer map so stale downstream answers are removed when the user
   * changes an earlier selection. Also resets the chain when re-answering a step
   * on the entry point while viewing a linked flowchart, since the chosen path may have changed.
   */
  const handleAnswerChange = (
    slug: string,
    stepId: string,
    optionId: string,
    clearStepIds?: string[],
  ) => {
    navigate({
      search: (prev) => {
        const prevSlugAnswers = (prev.answers ?? {})[slug] ?? {};
        // Remove answers for steps that come after the re-answered one
        const newSlugAnswers: Record<string, string> = {};
        for (const [sid, oid] of Object.entries(prevSlugAnswers)) {
          if (!clearStepIds?.includes(sid)) newSlugAnswers[sid] = oid;
        }
        newSlugAnswers[stepId] = optionId;
        return {
          ...prev,
          // If the user re-answers a step in the entry point while on a linked
          // flowchart, pop back to the entry point since the path may change.
          chain:
            slug === ENTRY_POINT_KEY && (prev.chain?.length ?? 0) > 0
              ? []
              : prev.chain,
          answers: { ...(prev.answers ?? {}), [slug]: newSlugAnswers },
        };
      },
      resetScroll: false,
    });
  };

  /** Pushes a linked flowchart UUID onto the chain, making it the active view. */
  const handleNavigateToFlowchart = (linkedFlowchartId: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        chain: [...(prev.chain ?? []), linkedFlowchartId],
      }),
    });
  };

  /**
   * Handles breadcrumb navigation. `linkedDepth` is the chain index + 1 of the
   * clicked item (null = entry point, i.e. clear the whole chain). Truncates
   * the chain and removes answers for all flowcharts no longer in scope.
   */
  const handleBreadcrumbClick = (linkedDepth: number | null) => {
    const newChain = linkedDepth === null ? [] : chain.slice(0, linkedDepth);
    // Keep only answers for flowcharts still in scope (entry point + newChain ids)
    const keepKeys = new Set([ENTRY_POINT_KEY, ...newChain]);
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
    onClick:
      idx < allItems.length - 1
        ? () => handleBreadcrumbClick(item.linkedDepth)
        : undefined,
  }));

  const currentData = currentLinkedFlowchartId
    ? chainQueries[chain.length - 1]?.data
    : null;

  const caption = currentData
    ? lang === "ja"
      ? currentData.nameJa
      : currentData.nameEn
    : t("data-submission");

  return (
    <Card caption={caption} captionSize={"lg"}>
      <Breadcrumbs items={breadcrumbs} locale={lang} />
      <NavigationChart
        entryPoint={!currentLinkedFlowchartId}
        flowchartId={
          currentLinkedFlowchartId ?? entryPointData?.id ?? undefined
        }
        answerKey={
          currentLinkedFlowchartId ? currentLinkedFlowchartId : ENTRY_POINT_KEY
        }
        locale={lang}
        answers={answers ?? {}}
        onAnswerChange={handleAnswerChange}
        onNavigateToFlowchart={handleNavigateToFlowchart}
      />
    </Card>
  );
}
