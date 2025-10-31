import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/revision/$revision"
)({
  component: RouteComponent,

  loader: async ({ context, params }) => {
    const version = await context.queryClient.ensureQueryData(
      getDocumentVersionTranslationQueryOptions({
        contentId: "data-submission",
        versionNumber: Number(params.revision),
        locale: context.lang,
      })
    );

    return { version, crumb: `Revision ${params.revision}` };
  },
});

function RouteComponent() {
  const { version } = Route.useLoaderData();

  return (
    <Card caption={version.title}>
      <RenderMarkdoc className="mx-auto" content={version.content} />
    </Card>
  );
}
