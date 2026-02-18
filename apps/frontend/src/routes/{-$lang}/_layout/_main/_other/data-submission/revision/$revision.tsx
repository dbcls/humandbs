import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { Markdown } from "@/components/Merkdown";
import { TOC } from "@/components/TOC";
import { $getPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/revision/$revision",
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

    const contentHtml = await renderMarkdown(data?.content ?? "");

    return {
      contentHtml,
      title: data?.title,
      crumb: `Revision ${params.revision}`,
    };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();

  return (
    <Card caption={title}>
      <TOC headings={contentHtml.headings} />
      <Markdown className="mx-auto" contentHtml={contentHtml} />
    </Card>
  );
}
