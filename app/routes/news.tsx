import { Link } from "react-router"

import { Heading, Stack } from "~/components/base"
import { Card, Crumbs, Empty, Page } from "~/components/page"
import { SearchBox } from "~/components/search"
import { NewsList } from "~/components/site"
import { messagesFor } from "~/i18n/messages"
import { newsList } from "~/public/site.server"
import { href, newsPath, readLocale } from "~/public/urls"

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
        <Stack gap="normal">
          <Heading title={messages.news.all} />

          {/*
            A GET form, so the search is in the address and can be linked to. It
            is not the public search (`docs/public-pages.md`): announcements are
            not indexed, and this is one `ILIKE` over 682 rows. It is drawn as
            the same box all the same — which index answers is not something a
            reader can see.
          */}
          <Stack gap="tight">
            <SearchBox
              action={href(locale, newsPath())}
              name="find"
              value={find}
              label={messages.news.find}
              placeholder={messages.news.find}
              submit={messages.news.find}
            />
            {find !== "" && (
              <p className="text-sm">
                <Link to={href(locale, newsPath())}>{messages.news.clearFind}</Link>
              </p>
            )}
          </Stack>

          {items.length === 0
            ? <Empty>{find === "" ? messages.news.none : messages.news.noMatch}</Empty>
            : <NewsList locale={locale} items={items} />}

          <nav className="flex justify-between text-sm">
            {page > 1
              ? <Link to={pageHref(page - 1)}>{messages.news.newer}</Link>
              : <span />}
            {hasNext
              ? <Link to={pageHref(page + 1)}>{messages.news.older}</Link>
              : <span />}
          </nav>
        </Stack>
      </Card>
    </Page>
  )
}
