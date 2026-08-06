import { Link } from "react-router"

import { Card, Empty, Page, PageHead } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { newsList } from "~/public/site.server"
import { href, newsItemPath, newsPath, readLocale } from "~/public/urls"

import type { Route } from "./+types/news"

/**
 * Announcements, newest first.
 *
 * Paging is by offset rather than by cursor: the list is ordered by a date the
 * editors set, which does not move, and 682 items is not a scale where a
 * cursor earns its complexity. The page number is in the address so a position
 * in the list can be linked to.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const asked = Number(url.searchParams.get("page") ?? "1")
  const page = Number.isInteger(asked) && asked >= 1 ? asked : 1
  return { locale, ...await newsList(locale, page) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: `${messages.news.all} - ${messages.siteName}` }]
}

export default function News({ loaderData }: Route.ComponentProps) {
  const { locale, items, page, hasNext } = loaderData
  const messages = messagesFor(locale)
  const pageHref = (n: number) => `${href(locale, newsPath())}?page=${n}`

  return (
    <Page>
      <PageHead label={messages.news.all} />
      <Card>
        {items.length === 0
          ? <Empty>{messages.news.none}</Empty>
          : (
              <ul className="flex flex-col divide-y divide-line">
                {items.map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="text-ink-muted text-xs">
                      {item.publishedAt ?? messages.news.undated}
                    </div>
                    <Link to={href(locale, newsItemPath(item.id))}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            )}

        <nav className="mt-6 flex justify-between text-sm">
          {page > 1
            ? <Link to={pageHref(page - 1)}>{messages.news.newer}</Link>
            : <span />}
          {hasNext
            ? <Link to={pageHref(page + 1)}>{messages.news.older}</Link>
            : <span />}
        </nav>
      </Card>
    </Page>
  )
}
