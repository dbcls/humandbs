import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { Markdown } from "@/components/Merkdown";
import { getNewsTranslationQueryOptions } from "@/serverFunctions/news";
import { renderMarkdown } from "@/utils/markdown";
import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";
import { useLocale } from "use-intl";

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

  const lang = useLocale();

  return (
    <Card className="min-w-0 flex-1">
      <MarkdownWithTOC
        title={
          <div className="custom-prose">
            <h1>{title}</h1>
            {publishedAt && (
              <span className="text-foreground-light text-xs">
                {new Date(publishedAt).toLocaleDateString(lang)}
              </span>
            )}
          </div>
        }
        markdownResult={contentHtml}
      />
    </Card>
  );
}
