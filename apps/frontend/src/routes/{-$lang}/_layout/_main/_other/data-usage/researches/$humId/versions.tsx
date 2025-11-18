import { CardWithCaption } from "@/components/Card";
import { ContentHeader } from "@/components/ContentHeader";
import { TextWithIcon } from "@/components/TextWithIcon";
import { FA_ICONS } from "@/lib/faIcons";
import { getResearchVersionsQueryOptions } from "@/serverFunctions/researches";
import { ResearchVersionDoc } from "@humandbs/backend/types";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/$humId/versions"
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const versions = await context.queryClient.ensureQueryData(
      getResearchVersionsQueryOptions({
        humId: params.humId,
        lang: context.lang,
      })
    );
    return { data: versions.data, crumb: "Versions" };
  },
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return (
    <CardWithCaption variant={"dark"} caption="Versions">
      {/*TODO add locales for this*/}
      <ContentHeader>Released versions</ContentHeader>

      <ul>
        {data.map((ver) => (
          <li key={ver.humVersionId}>
            <VersionCard version={ver} />
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}

function VersionCard({ version }: { version: ResearchVersionDoc }) {
  return (
    <CardWithCaption
      variant={"light"}
      caption={version.version}
      containerClassName="flex flex-col gap-4"
    >
      <ul>
        {version.datasets.map((ds) => (
          <li key={ds}>
            <TextWithIcon icon={FA_ICONS.dataset}>{ds}</TextWithIcon>
          </li>
        ))}
      </ul>
      <section>{version.releaseNote}</section>
    </CardWithCaption>
  );
}
