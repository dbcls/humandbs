import { CardWithCaption } from "@/components/Card";
import { ContentHeader } from "@/components/ContentHeader";
import { TextWithIcon } from "@/components/TextWithIcon";
import { FA_ICONS } from "@/lib/faIcons";
import {
  getResearchQueryOptions,
  getResearchVersionsQueryOptions,
} from "@/serverFunctions/researches";
import { ResearchVersionDoc } from "@humandbs/backend/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { VersionCard } from "./-VersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/$humId/"
)({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      getResearchQueryOptions({
        lang: context.lang,
        humId: params.humId,
      })
    );

    return { data };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <VersionCard versionData={data} />;
}
