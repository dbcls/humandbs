import { Heading, Stack } from "~/components/base"
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
        {/*
          The date belongs to the title, so it sits close under it; the article
          is the next thing rather than the rest of the same one, and stands off
          at the distance between blocks. Read at one step each way the three
          run together and the date reads as the article's first line.
        */}
        <Stack gap="block">
          <Stack gap="tight">
            <Heading title={item.title} />
            <p className="text-ink-muted text-sm">
              {item.publishedAt ?? messages.news.undated}
            </p>
          </Stack>
          <Markdown html={item.html} />
        </Stack>
      </Card>
    </Page>
  )
}
