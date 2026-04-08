import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { Markdown } from "@/components/Merkdown";
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

    return {
      contentHtml,
      title: newsItem.title,
      crumb: newsItem.title,
      publishedAt: newsItem.newsItem.publishedAt,
    };
  },
});

function RouteComponent() {
  const { contentHtml, publishedAt, title } = Route.useLoaderData();

  return (
    <Card className="min-w-0 flex-1">
      <div className="prose mx-auto prose-a:text-secondary-light prose-a:visited:text-secondary-lighter prose-h1:mt-8 prose-h1:mb-16 prose-h1:font-medium prose-h1:text-secondary">
        <h1>
          {title}
          <p className="text-xs text-foreground-light">{publishedAt}</p>
        </h1>
        <Markdown contentHtml={contentHtml} />
      </div>
    </Card>
  );
}
