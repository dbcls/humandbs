import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { $getPublishedDocumentVersion } from "@/serverFunctions/documentVersion";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/revision/$revision"
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

    const { toc, content } = transformMarkdoc({
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
  const { content } = Route.useLoaderData();

  return (
    <Card caption={content?.title}>
      <RenderMarkdoc className="mx-auto" content={content?.content ?? ""} />
    </Card>
  );
}
