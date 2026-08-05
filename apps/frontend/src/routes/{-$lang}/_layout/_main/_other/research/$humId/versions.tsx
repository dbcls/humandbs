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

import { getAddedDatasets } from "./-releaseDatasets";

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
  head: ({ match }) => {
    const seoTitle = `HumanDBs - ${match.params.humId}: ${match.context.messages?.Research?.["release-info"]})`;

    return {
      meta: [
        {
          title: seoTitle,
        },
      ],
    };
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
        {data.map((ver, index) => (
          <li key={ver.humVersionId}>
            <VersionInfo
              version={ver}
              addedDatasets={getAddedDatasets(ver.datasets, data[index + 1]?.datasets)}
            />
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}

function VersionInfo({
  version,
  addedDatasets,
}: {
  version: RenderedResearchVersionItem;
  addedDatasets: RenderedResearchVersionItem["datasets"];
}) {
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
      </h3>
      <section className="flex items-start gap-5 px-3 py-4 text-sm">
        <div className="w-80 shrink-0">
          <h4 className="mb-4 font-semibold text-secondary text-xs">
            {tResearch("datasetsAddedInRelease")}
          </h4>
          {addedDatasets.length > 0 ? (
            <ul className="w-full space-y-1.5">
              {addedDatasets.map((ds) => (
                <li key={ds.datasetId}>
                  <DatasetLink
                    className="max-w-full whitespace-normal [&>span>span]:min-w-0 [&>span>span]:break-all"
                    datasetId={ds.datasetId}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400 text-sm">{tResearch("noDatasetsAddedInRelease")}</p>
          )}
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
