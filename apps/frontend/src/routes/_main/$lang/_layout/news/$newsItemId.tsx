import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getNewsTranslationQueryOptions } from "@/serverFunctions/news";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/news/$newsItemId")({
  component: RouteComponent,
  search: {},
  loader: async ({ context, params }) => {
    const lang = context.lang;
    const id = params.newsItemId;

    const newsItem = await context.queryClient.ensureQueryData(
      getNewsTranslationQueryOptions({ newsItemId: id, lang })
    );

    return { newsItem, crumb: newsItem.title };
  },
});

function RouteComponent() {
  const { newsItem } = Route.useLoaderData();

  return (
    <Card caption={newsItem?.title}>
      <RenderMarkdoc content={newsItem?.content} />
    </Card>
  );
}
