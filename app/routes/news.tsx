import { Link } from "react-router"

import { Button, ButtonLink, Heading } from "~/components/base"
import { CONTROL } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Crumbs, Empty, Page } from "~/components/page"
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
  const find = url.searchParams.get("find") ?? ""
  return { locale, find, ...await newsList(locale, page, undefined, find) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: `${messages.news.all} - ${messages.siteName}` }]
}

export default function News({ loaderData }: Route.ComponentProps) {
  const { locale, items, page, hasNext, find } = loaderData
  const messages = messagesFor(locale)
  const pageHref = (n: number) =>
    `${href(locale, newsPath())}?${new URLSearchParams(
      find === "" ? { page: String(n) } : { find, page: String(n) },
    ).toString()}`

  return (
    <Page width="reading">
      <Crumbs locale={locale} current={messages.news.all} />
      <Card under={false}>
        <Heading title={messages.news.all} />

        {/*
          A GET form, so the search is in the address and can be linked to. It
          is not the public search (`docs/public-pages.md`): announcements are
          not indexed, and this is one `ILIKE` over 682 rows.
        */}
        <form method="get" action={href(locale, newsPath())} role="search" className="mt-4 flex gap-2">
          <input
            type="search"
            name="find"
            defaultValue={find}
            aria-label={messages.news.find}
            placeholder={messages.news.find}
            className={`min-w-0 flex-1 rounded-full ${CONTROL}`}
          />
          <Button variant="secondary" pill icon={<Icon name="search" />}>
            {messages.news.find}
          </Button>
          {find !== "" && (
            <ButtonLink to={href(locale, newsPath())} variant="ghost" pill>
              {messages.news.clearFind}
            </ButtonLink>
          )}
        </form>

        {items.length === 0 && find !== ""
          ? <p className="mt-6 text-ink-muted">{messages.news.noMatch}</p>
          : items.length === 0
            ? <Empty>{messages.news.none}</Empty>
            : (
                <ul className="mt-4 flex flex-col divide-y divide-line">
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
