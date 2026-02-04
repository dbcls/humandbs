import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { transformMarkdoc } from "@/markdoc/config";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { $getPublishedDocumentVersion } from "@/serverFunctions/documentVersion";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/revision/$revision"
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const data = await $getPublishedDocumentVersion({
      data: {
        contentId: "guidelines",
        locale: context.lang,
        versionNumber: Number(params.revision),
      },
    });

    const { content, toc } = transformMarkdoc({
      generateTOC: true,
      rawContent: data?.content ?? "",
    });

    return {
      content: JSON.stringify(content),
      toc,
      crumb: `Revision ${params.revision}`,
    };
  },
});

function RouteComponent() {
  const { content, toc } = Route.useLoaderData();
  return (
    <Card caption={content?.title} captionSize={"lg"}>
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <MarkdocTOC headings={toc} />
        <RenderMarkdoc content={content} />
      </div>
    </Card>
  );
}
