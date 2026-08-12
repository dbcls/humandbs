import { Heading } from "~/components/base"
import { Markdown } from "~/components/markdown"
import { Card, Crumbs, Page } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { newsItemPage } from "~/public/site.server"
import { href, newsPath, readLocale } from "~/public/urls"

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
    <Page width="reading">
      <Crumbs
        locale={locale}
        trail={[{ label: messages.news.all, to: href(locale, newsPath()) }]}
        current={item.title}
      />
      <Card under={false}>
        <Heading title={item.title} />
        <p className="mt-2 text-ink-muted text-sm">
          {item.publishedAt ?? messages.news.undated}
        </p>
        <div className="mt-4">
          <Markdown html={item.html} />
        </div>
      </Card>
    </Page>
  )
}
