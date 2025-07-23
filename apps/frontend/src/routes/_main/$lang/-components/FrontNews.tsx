import { Link } from "@/components/Link";
import { NewsTitleResponse } from "@/serverFunctions/news";
import { useLoaderData } from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

function NewsItem({ newsItem }: { newsItem: NewsTitleResponse }) {
  const locale = useLocale();

  return (
    <li>
      <span className="text-xs">
        {newsItem.publishedAt?.toLocaleDateString(locale)}
      </span>
      <Link
        className="text-secondary text-sm underline"
        to={"/$lang/news/$newsItemId"}
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
  const { newsTitles } = useLoaderData({ from: "/_main/$lang/" });

  const lang = useLocale();

  const t = useTranslations("Navbar");

  return (
    <div className="flex flex-col gap-2">
      <ul className="space-y-2">
        {newsTitles.map((item, index) => (
          <NewsItem key={index} newsItem={item} />
        ))}
      </ul>
      <Link to="/$lang/news" params={{ lang }}>
        {t("all-news")}
      </Link>
    </div>
  );
}

export { News };
