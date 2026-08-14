import { redirect } from "react-router"

import { Heading, Stack } from "~/components/base"
import { Card, Crumbs, Empty, Page, PageLinks } from "~/components/page"
import { SearchBox } from "~/components/search"
import { NewsList } from "~/components/site"
import { messagesFor } from "~/i18n/messages"
import { NEWS_PER_PAGE, newsList } from "~/public/site.server"
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

  // **An empty condition is not a condition.** A GET form sends its field
  // whether or not anything was typed into it, so clearing the box and pressing
  // search left `?q=` written across the address bar for the whole listing.
  // One listing has one address, so the empty ones are dropped on the way in.
  const given = new URLSearchParams(url.search)
  let dropped = false
  for (const [key, value] of [...given]) {
    if (value.trim() === "") {
      given.delete(key)
      dropped = true
    }
  }
  if (dropped) {
    const query = given.toString()
    throw redirect(`${url.pathname}${query === "" ? "" : `?${query}`}`)
  }

  const asked = Number(given.get("page") ?? "1")
  const page = Number.isInteger(asked) && asked >= 1 ? asked : 1
  const find = given.get("q") ?? ""
  return { locale, find, ...await newsList(locale, page, undefined, find) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: `${messages.news.all} - ${messages.siteName}` }]
}

export default function News({ loaderData }: Route.ComponentProps) {
  const { locale, items, page, pageCount, total, find } = loaderData
  const messages = messagesFor(locale)
  const pageHref = (to: number) => {
    const at = new URLSearchParams()
    if (find !== "") at.set("q", find)
    // The first page is the bare address: one listing has one address.
    if (to > 1) at.set("page", String(to))
    const query = at.toString()
    return `${href(locale, newsPath())}${query === "" ? "" : `?${query}`}`
  }

  // How many there are and where in them this page is, in the words the two
  // listings use. Twenty rows and a way forward say nothing about how much is
  // behind them.
  const counted = (
    <p className="text-ink-muted text-sm">
      {messages.search.range(
        (page - 1) * NEWS_PER_PAGE + 1,
        Math.min(page * NEWS_PER_PAGE, total),
        total,
      )}
    </p>
  )

  // Above the list as well as below it: twenty announcements are longer than
  // the window, and the reader who has read the top of a page and wants the
  // next one should not have to scroll past what they have just rejected.
  const pageLinks = (
    <PageLinks
      label={messages.search.pagination}
      page={page}
      pageCount={pageCount}
      at={pageHref}
      previous={messages.search.previousPage}
      next={messages.search.nextPage}
    />
  )

  return (
    <Page>
      <Crumbs locale={locale} current={messages.news.all} />
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={messages.news.all} />

          {/*
            The box, how many there are, and the way through them, on one line:
            all three are about which announcements are on screen, and the box
            is the only one of them the reader acts on first.

            The box is a GET form, so the search is in the address and can be
            linked to. It is not the public search (`docs/public-pages.md`):
            announcements are not indexed, and this is one `ILIKE` over 682
            rows. It is drawn as the same box all the same — which index answers
            is not something a reader can see. **It searches as the words are
            typed**, and clearing the box is what lifts the search.
          */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/*
              Wide enough for the words somebody searches announcements with,
              and no wider: sharing the line with the count and the page links
              is what the box is doing here, so taking the rest of the row would
              push those two to the far edge of a 1440px screen.
            */}
            <div className="mr-auto w-full max-w-96">
              <SearchBox
                action={href(locale, newsPath())}
                name="q"
                value={find}
                label={messages.news.find}
                placeholder={messages.news.find}
                submit={messages.news.find}
                size="compact"
                searchAsTyped
              />
            </div>
            {items.length > 0 && (
              <>
                {counted}
                {pageLinks}
              </>
            )}
          </div>

          {items.length === 0
            ? <Empty>{find === "" ? messages.news.none : messages.news.noMatch}</Empty>
            : (
                <Stack gap="normal">
                  <NewsList locale={locale} items={items} dateBeside />
                  {/* The same two, at the end of the page they describe. */}
                  <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
                    {counted}
                    {pageLinks}
                  </div>
                </Stack>
              )}
        </Stack>
      </Card>
    </Page>
  )
}
