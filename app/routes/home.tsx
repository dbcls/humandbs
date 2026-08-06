import { Link } from "react-router"

import { Page, Section } from "~/components/page"
import { Markdown } from "~/components/markdown"
import { ActionButton, ActionRow } from "~/components/site"
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
 * The search box belongs here and is not built yet; it arrives with the search
 * layer, along with the two list addresses the buttons already point at.
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
        <div>
          {intro !== null && (
            <>
              <h1 className="font-bold text-2xl text-brand">{intro.title}</h1>
              <Markdown html={intro.html} className="mt-4" />
            </>
          )}

          <div className="mt-10">
            <ActionRow>
              <ActionButton
                href={href(locale, "/data-submission")}
                label={messages.submission.heading}
              />
              <ActionButton
                href={href(locale, "/data-use")}
                label={messages.use.heading}
              />
            </ActionRow>
          </div>
        </div>

        <aside>
          <Section title={messages.news.latest}>
            {news.length === 0
              ? <p className="text-ink-muted text-sm">{messages.news.none}</p>
              : (
                  <ul className="flex flex-col divide-y divide-line">
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
          </Section>
        </aside>
      </div>
    </Page>
  )
}
