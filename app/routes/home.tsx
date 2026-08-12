import { Link } from "react-router"

import { BigAction, Heading } from "~/components/base"
import { Markdown } from "~/components/markdown"
import { Card, Page } from "~/components/page"
import { SearchExamples, SearchForm } from "~/components/search"
import { messagesFor } from "~/i18n/messages"
import { findDocument, newsList } from "~/public/site.server"
import { href, newsItemPath, newsPath, readLocale } from "~/public/urls"

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
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <Card under={false}>
          {intro !== null && (
            <>
              <Heading title={intro.title} />
              <Markdown html={intro.html} className="mt-4" />
            </>
          )}

          <div className="mt-8">
            <SearchForm locale={locale} target="research" keyword="" query="" size="large" />
            <SearchExamples locale={locale} />
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <BigAction to={href(locale, "/data-submission")} tone="accent" icon="upload">
              {messages.submission.heading}
            </BigAction>
            <BigAction to={href(locale, "/data-use")} tone="brand" icon="download">
              {messages.use.heading}
            </BigAction>
          </div>
        </Card>

        <aside>
          <Card under={false}>
            <Heading level="h2" title={messages.news.latest} />
            {news.length === 0
              ? <p className="mt-4 text-ink-muted text-sm">{messages.news.none}</p>
              : (
                  <ul className="mt-4 flex flex-col divide-y divide-line">
                    {news.map((item) => (
                      <li key={item.id} className="py-2 text-sm">
                        <div className="text-ink-muted text-xs">
                          {item.publishedAt ?? messages.news.undated}
                        </div>
                        <Link to={href(locale, newsItemPath(item.id))}>{item.title}</Link>
                      </li>
                    ))}
                  </ul>
                )}
            <p className="mt-3 text-sm">
              <Link to={href(locale, newsPath())}>{messages.news.all}</Link>
            </p>
          </Card>
        </aside>
      </div>
    </Page>
  )
}
