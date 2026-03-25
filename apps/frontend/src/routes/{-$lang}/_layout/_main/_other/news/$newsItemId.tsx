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

    return { contentHtml, title: newsItem.title };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();

  return (
    <Card className="w-full">
      <div className="max-w-[800px] mx-auto">
        <div className="prose prose-h1:text-secondary prose-h1:font-medium prose-h1:mb-2 text-base">
          <h1>{title}</h1>
        </div>
        <Markdown contentHtml={contentHtml} />
      </div>
    </Card>
  );
}
