import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { DatasetLink } from "@/components/DatasetLink";
import { Markdown } from "@/components/markdown";
import { TextWithIcon } from "@/components/TextWithIcon";
import { i18n } from "@/config/i18n";
import { FA_ICONS } from "@/lib/faIcons";
import { getResearchVersionsQueryOptions } from "@/serverFunctions/researches";
import type { RenderedResearchVersionItem } from "@/utils/renderedHtml/types";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/research/$humId/versions")({
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

function VersionInfo({ version }: { version: RenderedResearchVersionItem }) {
  const { lang } = useRouteContext({ strict: false });
  const tResearch = useTranslations("Research");

  return (
    <section className="overflow-clip rounded-sm border border-gray-200">
      <h3 className="flex w-full items-baseline gap-3 bg-linear-to-r from-cyan-900 to-secondary-lighter px-4 py-2">
        <Route.Link to="../$version" params={{ version: version.version }}>
          <TextWithIcon className="text-white" icon={FA_ICONS.books}>
            {version.humVersionId}
          </TextWithIcon>
        </Route.Link>

        <span className="ml-3 text-2xs text-foreground-light">{version.versionReleaseDate}</span>
      </h3>
      <section className="flex items-start gap-5 px-3 py-4 text-sm">
        <div>
          <h4 className="mb-4 font-semibold text-secondary text-xs">{tResearch("datasets")}</h4>
          <ul className="w-72 space-y-1.5">
            {version.datasets.map((ds) => (
              <li key={ds.datasetId}>
                <DatasetLink datasetId={ds.datasetId} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-4 font-semibold text-secondary text-xs">{tResearch("releaseNote")}</h4>
          <Markdown
            className="inline-prose"
            contentHtml={{
              markup: version.releaseNote[lang ?? i18n.defaultLocale]?.renderedHtml ?? "",
            }}
          />

          <h4 className="my-4 font-semibold text-secondary text-xs">
            {tResearch("versionReleaseDate")}
          </h4>
          {version.versionReleaseDate}
        </div>
      </section>
    </section>
  );
}
