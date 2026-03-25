import { createFileRoute } from "@tanstack/react-router";

import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";
import { getNewsTranslationQueryOptions } from "@/serverFunctions/news";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/news/$newsItemId",
)({
  component: RouteComponent,

  loader: async ({ context, params }) => {
    const lang = context.lang;
    const id = params.newsItemId;

    const newsItem = await context.queryClient.ensureQueryData(
      getNewsTranslationQueryOptions({ newsItemId: id, lang }),
    );

    const contentHtml = await renderMarkdown(newsItem.content ?? "");

    return { contentHtml, title: newsItem.title };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();

  return <MarkdownWithTOC title={title} markdownResult={contentHtml} />;
}
