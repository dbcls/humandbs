import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";
import { CONTENT_IDS } from "@/config/content-config";
import { $getLatestPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";
import { enumFromStringArray } from "@/utils/zod";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/$slug",
)({
  component: RouteComponent,
  params: z.object({ slug: enumFromStringArray(CONTENT_IDS.guidelines) }),
  loader: async ({ context, params }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: { contentId: params.slug, locale: context.lang },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return {
      contentHtml,
      title: context.messages?.Navbar?.[params.slug] ?? null,
      crumb: data?.title,
    };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();

  return <MarkdownWithTOC title={title} markdownResult={contentHtml} />;
}
