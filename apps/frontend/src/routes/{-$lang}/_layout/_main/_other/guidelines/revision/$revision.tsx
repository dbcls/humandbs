import { Card } from "@/components/Card";
import { CONTENT_IDS } from "@/lib/content-config";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/revision/$revision"
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      getDocumentVersionTranslationQueryOptions({
        contentId: CONTENT_IDS.guidelines[0],
        locale: context.lang,
        versionNumber: Number(params.revision),
        generateTOC: true,
      })
    );

    return { ...data, crumb: `Revision ${params.revision}` };
  },
});

function RouteComponent() {
  const { content, title, toc } = Route.useLoaderData();
  return (
    <Card caption={title} captionSize={"lg"}>
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <MarkdocTOC headings={toc} />
        <RenderMarkdoc content={content} />
      </div>
    </Card>
  );
}
