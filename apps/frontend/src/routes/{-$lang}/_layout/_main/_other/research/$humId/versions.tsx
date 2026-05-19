import type { ResearchVersionDoc } from "@humandbs/backend/types";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { Separator } from "@/components/Separator";
import { TextWithIcon } from "@/components/TextWithIcon";
import { i18n } from "@/config/i18n";
import { FA_ICONS } from "@/lib/faIcons";
import { getResearchVersionsQueryOptions } from "@/serverFunctions/researches";
import { useTranslations } from "use-intl";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/research/$humId/versions",
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const versions = await context.queryClient.ensureQueryData(
      getResearchVersionsQueryOptions({
        humId: params.humId,
        lang: context.lang,
        includeRawHtml: false,
      }),
    );
    return { data: versions.data, crumb: "Versions" };
  },
});

function RouteComponent() {
  const { data } = Route.useLoaderData();
  const { humId } = Route.useParams();

  return (
    <CardWithCaption
      size={"lg"}
      variant={"dark"}
      caption={
        <CardCaption icon="books" title="NBDC Research ID:">
          {humId}
        </CardCaption>
      }
    >
      <ul className="space-y-4">
        {data.map((ver, i) => (
          <li key={ver.humVersionId}>
            <VersionInfo version={ver} />
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}

function VersionInfo({ version }: { version: ResearchVersionDoc }) {
  const { lang } = useRouteContext({ strict: false });
  const tResearch = useTranslations("Research");

  return (
    <section className="overflow-clip rounded-sm border border-gray-200">
      <h3 className="to-secondary-lighter flex w-full items-baseline gap-3 bg-linear-to-r from-cyan-900 px-4 py-2">
        <Route.Link to="../$version" params={{ version: version.version }}>
          <TextWithIcon className="text-white" icon={FA_ICONS.books}>
            {version.humVersionId}
          </TextWithIcon>
        </Route.Link>

        <span className="text-foreground-light text-2xs ml-3">
          {version.versionReleaseDate}
        </span>
      </h3>
      <section className="flex items-start gap-5 px-3 py-4 text-sm">
        <div>
          <h4 className="text-secondary mb-4 text-xs font-semibold">
            {tResearch("datasets")}
          </h4>
          <div className="w-72">
            {version.datasets.map((ds) => (
              <Route.Link
                key={ds.datasetId}
                to="/{-$lang}/dataset/$datasetId"
                params={{ datasetId: ds.datasetId }}
              >
                <TextWithIcon icon={FA_ICONS.books}>
                  {version.humVersionId}
                </TextWithIcon>
              </Route.Link>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-secondary mb-4 text-xs font-semibold">
            {tResearch("releaseNote")}
          </h4>
          {version.releaseNote[lang ?? i18n.defaultLocale]?.text}
          <h4 className="text-secondary my-4 text-xs font-semibold">
            {tResearch("versionReleaseDate")}
          </h4>
          {version.versionReleaseDate}
        </div>
      </section>
    </section>
  );
}
