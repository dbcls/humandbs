import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { Markdown } from "@/components/Merkdown";
import { TOC } from "@/components/TOC";
import { $getPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/revision/$revision",
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
    <Card className="w-full">
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <TOC headings={contentHtml.headings} />
        <div className="flex-1 min-w-0">
          <div className="prose prose-h1:text-secondary prose-h1:font-medium prose-h1:mb-2 text-base">
            <h1>{title}</h1>
          </div>
          <Markdown contentHtml={contentHtml} />
        </div>
      </div>
    </Card>
  );
}
