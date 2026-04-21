import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  // Current flowchart slug — defaults to entry point
  flowchart: z.string().optional(),
  // Child flowchart id when navigating via linkedFlowchartId
  childId: z.string().optional(),
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
  const { answers, childId } = Route.useSearch();
  const t = useTranslations("Data-submission");

  const currentSlug = Route.useSearch().flowchart ?? ENTRY_POINT_SLUG;

  // Load entry point for breadcrumb name resolution
  const { data: entryPointData } = useQuery(
    getNavigationFlowchartQueryOptions(ENTRY_POINT_SLUG, lang),
  );

  // Load child flowchart metadata (name only, for breadcrumb + caption)
  const { data: childData } = useQuery({
    ...getNavigationFlowchartByIdQueryOptions(childId ?? "", lang),
    enabled: !!childId,
  });

  // Build breadcrumb trail: any answer key that isn't the current context
  const activeId = childId ?? null;
  const breadcrumbs: BreadcrumbItem[] = Object.keys(answers ?? {})
    .filter((slug) => {
      // Exclude the slug that corresponds to what's currently displayed.
      // When showing a child by id, the parent slug is the one to show as breadcrumb.
      if (activeId) return slug !== (childData?.slug ?? null);
      return slug !== currentSlug;
    })
    .map((slug) => {
      if (slug === ENTRY_POINT_SLUG && entryPointData) {
        return { slug, nameEn: entryPointData.nameEn, nameJa: entryPointData.nameJa };
      }
      return { slug, nameEn: slug, nameJa: slug };
    });

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
        childId: linkedFlowchartId,
      }),
    });
  };

  const caption = childData
    ? lang === "ja" ? childData.nameJa : childData.nameEn
    : t("data-submission");

  return (
    <Card caption={caption} captionSize={"lg"}>
      <Breadcrumbs items={breadcrumbs} locale={lang} />
      <NavigationChart
        slug={childId ? undefined : currentSlug}
        flowchartId={childId}
        locale={lang}
        answers={answers ?? {}}
        onAnswerChange={handleAnswerChange}
        onNavigateToChild={handleNavigateToChild}
      />
    </Card>
  );
}
