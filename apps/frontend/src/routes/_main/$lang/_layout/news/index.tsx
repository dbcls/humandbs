import { Card } from "@/components/Card";
import { Link } from "@/components/Link";
import { Locale } from "@/lib/i18n-config";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";
import { createFileRoute } from "@tanstack/react-router";
import { useLocale } from "use-intl";
import { z } from "zod";
export const Route = createFileRoute("/_main/$lang/_layout/news/")({
  component: RouteComponent,
  validateSearch: z.object({
    limit: z.number().min(1).max(100).default(10),
    offset: z.number().min(0).default(0),
  }),
  loaderDeps: ({ search: { offset, limit } }) => ({
    offset,
    limit,
  }),
  loader: async ({ context, deps, params }) => {
    const { offset, limit } = deps;

    const locale = params.lang as Locale;

    const newsTitles = await context.queryClient.ensureQueryData(
      getNewsTitlesQueryOptions({ limit, offset, locale })
    );

    return {
      newsTitles,
    };
  },
  context() {
    return {
      crumb: "All news",
    };
  },
});

function RouteComponent() {
  const { newsTitles } = Route.useLoaderData();

  const locale = useLocale();

  return (
    <Card caption="All news">
      <ul>
        {newsTitles.map((item) => (
          <li key={item.id}>
            <span>{item.publishedAt?.toLocaleDateString(locale)}</span>
            <Link
              to={"/$lang/news/$newsItemId"}
              params={{
                lang: item.locale,
                newsItemId: item.id,
              }}
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
