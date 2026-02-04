import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { Card } from "@/components/Card";
import { CONTENT_IDS } from "@/config/content-config";
import { enumFromStringArray } from "@/lib/utils";
import { transformMarkdoc } from "@/markdoc/config";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { $getLatestPublishedDocumentVersion } from "@/serverFunctions/documentVersion";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/$slug"
)({
  component: RouteComponent,
  params: z.object({ slug: enumFromStringArray(CONTENT_IDS.guidelines) }),
  loader: async ({ context, params }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: { contentId: params.slug, locale: context.lang },
    });

    const { content, toc } = transformMarkdoc({
      generateTOC: true,
      rawContent: data?.content ?? "",
    });

    return {
      content: JSON.stringify(content),
      title: context.messages?.Navbar?.[params.slug],
      toc,
      crumb: data?.title,
    };
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
