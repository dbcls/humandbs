import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { Markdown } from "@/components/Merkdown";
import { TOC } from "@/components/TOC";
import { $getPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";
import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";

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
      title: data?.title ?? null,
      crumb: `Revision ${params.revision}`,
    };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();

  return <MarkdownWithTOC title={title} markdownResult={contentHtml} />;
}
