import { useLocale, useTranslations } from "use-intl";

import { Link } from "@/components/Link";
import {
  getNewsTitlesQueryOptions,
  type NewsTitleResponse,
} from "@/serverFunctions/news";
import { useSuspenseQuery } from "@tanstack/react-query";

function NewsItem({ newsItem }: { newsItem: NewsTitleResponse }) {
  const lang = useLocale();
  return (
    <li>
      {newsItem.publishedAt ? (
        <span className="w-24 shrink-0 text-xs">
          {new Date(newsItem.publishedAt).toLocaleDateString(lang)}
        </span>
      ) : null}

      <Link
        className="text-secondary line-clamp-3 h-fit text-base underline"
        to="/{-$lang}/news/$newsItemId"
        params={
          {
            newsItemId: newsItem.id,
          } as never
        }
      >
        {newsItem.title}
      </Link>
    </li>
  );
}

function News() {
  const lang = useLocale();
  const { data: newsTitles } = useSuspenseQuery(
    getNewsTitlesQueryOptions({ locale: lang }),
  );

  const t = useTranslations("Navbar");

  return (
    <div className="flex flex-col gap-2">
      <ul className="space-y-4">
        {newsTitles.map((item, index) => (
          <NewsItem key={index} newsItem={item} />
        ))}
      </ul>
      <Link to="/{-$lang}/news" className="mt-6">
        {t("all-news")}
      </Link>
    </div>
  );
}

export { News };
