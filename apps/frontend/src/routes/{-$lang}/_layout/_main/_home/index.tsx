import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "@/components/Merkdown";
import { $getLatestPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_home/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: { contentId: "home", locale: context.lang },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return { contentHtml, title: data.title };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();
  return (
    <Markdown
      contentHtml={contentHtml}
      title={title}
      className="prose-h1:mb-4 prose-h1:text-center prose-h1:text-lg"
    />
  );
}
