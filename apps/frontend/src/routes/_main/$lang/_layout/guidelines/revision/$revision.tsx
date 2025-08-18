import { Card } from "@/components/Card";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute(
  "/_main/$lang/_layout/guidelines/revision/$revision"
)({
  component: RouteComponent,
  params: z.object({
    revision: z.number(),
  }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      getDocumentVersionTranslationQueryOptions({
        contentId: "quidelines",
        locale: context.lang,
        versionNumber: params.revision,
        generateTOC: true,
      })
    );

    return { ...data, crumb: data.title };
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
