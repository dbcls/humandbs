import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { MarkdownWithTOC } from "@/components/markdown/MarkdownWithTOC";
import { getNewsTranslationQueryOptions } from "@/serverFunctions/news";
import { toDateString } from "@/utils/dates";
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
  head: ({ loaderData, match }) => {
    return {
      meta: [{ title: `HumanDBs - ${match.context.messages?.Front?.news} - ${loaderData?.title}` }],
    };
  },
  errorComponent: DefaultCatchBoundary,
});

function RouteComponent() {
  const { contentHtml, publishedAt, title } = Route.useLoaderData();

  return (
    <Card className="min-w-0 flex-1">
      <MarkdownWithTOC
        title={
          <div className="custom-prose">
            <h1>{title}</h1>
            {publishedAt && (
              <span className="text-foreground-light text-xs">{toDateString(publishedAt)}</span>
            )}
          </div>
        }
        markdownResult={contentHtml}
      />
    </Card>
  );
}
