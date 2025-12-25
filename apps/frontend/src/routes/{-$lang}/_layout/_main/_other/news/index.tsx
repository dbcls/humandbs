import { Card } from "@/components/Card";
import { Link } from "@/components/Link";
import { Locale } from "@/config/i18n-config";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";
import { createFileRoute } from "@tanstack/react-router";
import { LucideBell } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";
import { z } from "zod";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/news/")({
  component: RouteComponent,
  validateSearch: z.object({
    limit: z.number().min(1).max(100).default(10),
    offset: z.number().min(0).default(0),
  }),
  loaderDeps: ({ search: { offset, limit } }) => ({
    offset,
    limit,
  }),
  loader: async ({ context, deps }) => {
    const { offset, limit } = deps;

    const newsTitles = await context.queryClient.ensureQueryData(
      getNewsTitlesQueryOptions({ limit, offset, locale: context.lang })
    );

    return {
      newsTitles,
    };
  },
});

function RouteComponent() {
  const { newsTitles } = Route.useLoaderData();

  const t = useTranslations("Navbar");

  return (
    <Card caption={t("all-news")}>
      <ul>
        {newsTitles.map((item) => (
          <li key={item.id}>
            {item.alert && (
              <LucideBell className="text-accent mr-1 inline size-5 align-baseline" />
            )}
            <span className="text-sm">{item.publishedAt}</span>
            <Link
              className="ml-2"
              to={"/{-$lang}/news/$newsItemId"}
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
