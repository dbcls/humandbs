import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-submission/version/$version"
)({
  component: RouteComponent,

  loader: async ({ context, params }) => {
    const version = await context.queryClient.ensureQueryData(
      getDocumentVersionTranslationQueryOptions({
        contentId: "data-submission",
        versionNumber: Number(params.version),
        locale: context.lang,
      })
    );

    return { version, crumb: `version ${params.version}` };
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
