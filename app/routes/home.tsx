import { Heading, MoreLink, Stack } from "~/components/base"
import { Markdown } from "~/components/markdown"
import { Card, Empty, Page } from "~/components/page"
import { SearchExamples, SearchForm } from "~/components/search"
import { ActionButton, ActionRow, NewsList } from "~/components/site"
import { messagesFor } from "~/i18n/messages"
import { findDocument, newsList } from "~/public/site.server"
import { href, newsPath, readLocale } from "~/public/urls"

import type { Route } from "./+types/home"

const LATEST_NEWS = 5

/**
 * The front page is a screen, but its introduction is prose the office writes,
 * so it comes from the `home` document — the screen supplies the frame and the
 * document supplies the words. A missing or unpublished introduction leaves the
 * frame standing rather than turning the front page into a 404.
 *
 * The search box sits here and in the two listings, and nowhere else. Those are
 * the places a reader starts from, and a box in the header would have to be
 * carried by every page for the few who search from the middle of one.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const [intro, news] = await Promise.all([
    findDocument("home", locale),
    newsList(locale, 1, LATEST_NEWS),
  ])
  return { locale, intro, news: news.items }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: messagesFor(loaderData.locale).siteName }]
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { locale, intro, news } = loaderData
  const messages = messagesFor(locale)

  return (
    <Page>
      {/*
        Each box is as tall as what is in it. A grid stretches its cells to the
        tallest by default, which puts whichever column is shorter inside a
        panel of empty white — it was the announcements when they were five
        titles, and the introduction once they carried the opening of each
        article as well.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <Card under={false}>
          <Stack gap="block">
            {intro !== null && (
              <Stack gap="normal">
                <Heading title={intro.title} />
                <Markdown html={intro.html} />
              </Stack>
            )}

            <Stack gap="normal">
              <SearchForm locale={locale} target="research" keyword="" query="" size="large" />
              <SearchExamples locale={locale} />
            </Stack>

            {/*
              The same pair the two screens they lead to open with, at the same
              width: the front page is where a reader decides which half of the
              site they are in, and a button that stretched to half the card
              would say that the choice is as wide as the page.
            */}
            <ActionRow>
              <ActionButton
                href={href(locale, "/data-submission")}
                label={messages.submission.heading}
                tone="accent"
                icon="upload"
                external={false}
              />
              <ActionButton
                href={href(locale, "/data-use")}
                label={messages.use.heading}
                tone="brand"
                icon="download"
                external={false}
              />
            </ActionRow>
          </Stack>
        </Card>

        {/*
          The box is as tall as what is in it. Stretched to the height of the
          column beside it, five news entries sat in a white field twice their
          own height and the front page read as having a hole in it.
        */}
        <aside>
          <Card under={false}>
            <Stack gap="normal">
              {/* The way to the whole listing is on the heading rather than
                  under the last entry: it belongs to the box, not to the list. */}
              <Heading level="h2" title={messages.news.latest}>
                <MoreLink to={href(locale, newsPath())}>{messages.news.all}</MoreLink>
              </Heading>
              {news.length === 0
                ? <Empty>{messages.news.none}</Empty>
                : <NewsList locale={locale} items={news} />}
            </Stack>
          </Card>
        </aside>
      </div>
    </Page>
  )
}
