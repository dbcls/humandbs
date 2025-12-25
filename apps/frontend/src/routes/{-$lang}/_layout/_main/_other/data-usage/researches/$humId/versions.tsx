import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { Separator } from "@/components/Separator";
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
      <ul>
        {data.map((ver, i) => (
          <li key={ver.humVersionId}>
            <VersionInfo version={ver} />
            <Separator show={i < data.length - 1} extend={"lg"} />
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}

function VersionInfo({ version }: { version: ResearchVersionDoc }) {
  return (
    <section>
      <h3 className="inline">
        <Route.Link
          className="text-secondary font-semibold"
          to="../$version"
          params={{ version: version.version }}
        >
          {version.humVersionId}
        </Route.Link>
        <span className="text-foreground-light text-2xs ml-3">
          {version.releaseDate}
        </span>
      </h3>
      <section className="text-sm">
        {version.releaseNote.map((r, i) => (
          <p key={i}>{r}</p>
        ))}
      </section>
    </section>
  );
}
