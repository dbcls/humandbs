import { useLoaderData } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Link } from "@/components/Link";
import type { NewsTitleResponse } from "@/serverFunctions/news";

function NewsItem({ newsItem }: { newsItem: NewsTitleResponse }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-2xs w-24 shrink-0">{newsItem.publishedAt}</span>

      <Link
        className="text-secondary line-clamp-3 h-fit text-base underline"
        to="/{-$lang}/news/$newsItemId"
        params={{
          newsItemId: newsItem.id,
        } as never}
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
