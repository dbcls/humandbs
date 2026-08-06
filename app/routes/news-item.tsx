import { Card, Page, PageHead } from "~/components/page"
import { Markdown } from "~/components/markdown"
import { messagesFor } from "~/i18n/messages"
import { newsItemPage } from "~/public/site.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/news-item"

export async function loader({ params, request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return { locale, item: await newsItemPage(params.newsId, locale) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: `${loaderData.item.title} - ${messages.news.heading} - ${messages.siteName}` }]
}

export default function NewsItem({ loaderData }: Route.ComponentProps) {
  const { locale, item } = loaderData
  const messages = messagesFor(locale)

  return (
    <Page>
      <PageHead label={item.title}>
        <span>{item.publishedAt ?? messages.news.undated}</span>
      </PageHead>
      <Card>
        <Markdown html={item.html} />
      </Card>
    </Page>
  )
}
