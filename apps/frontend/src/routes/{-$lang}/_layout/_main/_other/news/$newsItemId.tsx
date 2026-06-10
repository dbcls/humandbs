import { createFileRoute } from "@tanstack/react-router";
import { useLocale } from "use-intl";

import { Card } from "@/components/Card";
import { MarkdownWithTOC } from "@/components/markdown/MarkdownWithTOC";
import { getNewsTranslationQueryOptions } from "@/serverFunctions/news";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/news/$newsItemId")({
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
                {publishedAt.toLocaleString(lang)}
              </span>
            )}
          </div>
        }
        markdownResult={contentHtml}
      />
    </Card>
  );
}
