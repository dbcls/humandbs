import { useLoaderData } from "@tanstack/react-router";
import { LucideBell } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Link } from "@/components/Link";
import type { NewsTitleResponse } from "@/serverFunctions/news";

function NewsItem({ newsItem }: { newsItem: NewsTitleResponse }) {
  return (
    <li className="flex items-start gap-2">
      {newsItem.alert && (
        <LucideBell className="text-accent mr-1 inline size-4" />
      )}
      <span className="text-2xs w-24 shrink-0">{newsItem.publishedAt}</span>

      <Link
        className="text-secondary text-sm underline h-fit"
        to="/{-$lang}/news/$newsItemId"
        params={{
          lang: newsItem.locale,
          newsItemId: newsItem.id,
        }}
      >
        {newsItem.title}
      </Link>
    </li>
  );
}

function News() {
  const { newsTitles } = useLoaderData({
    from: "/{-$lang}/_layout/_main/_home",
  });

  const lang = useLocale();

  const t = useTranslations("Navbar");

  return (
    <div className="flex flex-col gap-2">
      <ul className="space-y-2">
        {newsTitles.map((item, index) => (
          <NewsItem key={index} newsItem={item} />
        ))}
      </ul>
      <Link to="/{-$lang}/news" params={{ lang }} className="mt-6">
        {t("all-news")}
      </Link>
    </div>
  );
}

export { News };
