import { Card } from "@/components/Card";
import { CONTENT_IDS } from "@/config/content-config";
import { enumFromStringArray } from "@/lib/utils";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentLatestPublishedVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/$slug"
)({
  component: RouteComponent,
  params: z.object({ slug: enumFromStringArray(CONTENT_IDS.guidelines) }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      getDocumentLatestPublishedVersionTranslationQueryOptions({
        contentId: params.slug,
        generateTOC: true,
        locale: context.lang,
      })
    );

    return { data, crumb: data.title };
  },
});

function RouteComponent() {
  const {
    data: { content, toc, title },
  } = Route.useLoaderData();

  return (
    <Card caption={title} captionSize={"lg"}>
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <MarkdocTOC headings={toc} />
        <RenderMarkdoc content={content} />
      </div>
    </Card>
  );
}
