import { Form, Link } from "react-router"

import {
  NEWS_DATINGS,
  NEWS_SORT,
  NEWS_SORT_KEYS,
  NEWS_STATES,
  type NewsRow,
  type NewsSortKey,
} from "~/admin/contents"
import { newsListAction, newsListPage } from "~/admin/contents.server"
import { adminNewsListPath, adminNewsPath, newsQuery, type NewsListingQuery } from "~/admin/urls"
import { Heading, Stack } from "~/components/base"
import { contentsSaid, StateCell, StateIcon, stateLabel } from "~/components/contents"
import { Answer, Checkbox, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Paging, Table, Td } from "~/components/page"
import { type ListingPaging, ListingPresented, ListingTools, type Presentation, presentedQuery, RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { minuteOf } from "~/dates"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { href } from "~/public/urls"
import { useAsk } from "~/search-as-typed"

import type { Route } from "./+types/admin-contents-news"

/**
 * The announcements, newest first, unpublished ones included.
 *
 * **It is presented the way the articles are** — the conditions in a pane at
 * the left, the page size over the rows — because the two screens are the same
 * job on different bodies (docs/editing.md の「サイトコンテンツ」). **Unlike the
 * articles it can be ordered**, by the day and by the title: an editor looking
 * for one they wrote does not always know its date.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return newsListPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return newsListAction(request)
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.contents.news.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsNews({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const { locale } = view
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.dating.length
    + view.ja.length
    + view.en.length

  // The whole row over the rows, and only the count with the way through the
  // pages under them: a reader who reaches the end of a page is looking for the
  // next one, and the ordering and the page size would send them back to the top.
  const tools = (
    <ListingTools
      locale={locale}
      presented={presentation(view, locale)}
      at={(presented) => listingAt(view, locale, presented)}
      paging={paging(view, locale)}
    />
  )
  const pages = <Paging locale={locale} {...paging(view, locale)} />

  return (
    <Page>
      <Answer answer={actionData} locale={locale} said={(answer) => contentsSaid(answer, locale)} />
      <Card under={false}>
        <Stack gap="normal">
          {/*
            **The way to make one stands with the name of the screen**, as it
            does over the articles: it is the one thing a reader comes here to
            do that is not "open one of these".

            **It asks nothing first.** An announcement is made empty and
            written on its own screen, so the control is the act rather than a
            way into a panel.
          */}
          <Heading title={t.news.heading}>
            <Form method="post">
              <input type="hidden" name="intent" value="create-news" />
              <Submit icon={<Icon name="plus" />}>{t.news.add}</Submit>
            </Form>
          </Heading>

          <RefinableList
            open={paneOpen}
            busy={busy}
            locale={locale}
            onToggle={togglePane}
            inForce={inForce}
            // The box is never alone in the pane here: three axes stand under it
            // whatever the reader has asked for.
            refineHasMore
            refine={<Filters view={view} locale={locale} />}
            tools={tools}
            pages={pages}
            panel={null}
          >
            <Stack gap="normal">
              <Table
                headers={[t.title, t.news.publishedAt, t.languages.ja, t.languages.en]}
                whenEmpty={inForce === 0 ? t.news.none : t.news.noMatch}
              >
                {view.rows.map((row) => <Row key={row.id} row={row} locale={locale} />)}
              </Table>
            </Stack>
          </RefinableList>
        </Stack>
      </Card>
    </Page>
  )
}

interface ViewProps {
  view: Route.ComponentProps["loaderData"]
  locale: Locale
}

/**
 * One announcement.
 *
 * **The title is the way in**, standing first and carrying the link, as the
 * identifier does on the other listings: an announcement is looked for by what
 * it says, and the date is the value it is ordered and narrowed by rather than
 * the name it answers to.
 *
 * **An announcement with nothing written yet still has to be openable**, so the
 * word for that stands in the link's place — the date is in the next column and
 * would be the same thing twice.
 */
function Row({ row, locale }: { row: NewsRow, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  return (
    <tr>
      <Td floor="min-w-64">
        <Link to={href(locale, adminNewsPath(row.id))}>
          {row.title === "" ? t.news.untitled : row.title}
        </Link>
      </Td>
      {/* **A date still ahead is read in the language columns**, as the
          state 「公開予定」: what the date holds back is each published
          language, and the column that says a language is up is the one
          that has to say it is not up yet. */}
      <Td nowrap>
        {row.publishedAt === null
          ? <span className="text-ink-muted">{t.news.undated}</span>
          : minuteOf(row.publishedAt)}
      </Td>
      <Td nowrap><StateCell state={row.states.ja} locale={locale} ahead={row.scheduled} /></Td>
      <Td nowrap><StateCell state={row.states.en} locale={locale} ahead={row.scheduled} /></Td>
    </tr>
  )
}

/**
 * GET forms, so a narrowed listing has an address that can be kept and shared —
 * the same rule the articles and the public listings follow.
 *
 * **Nothing here waits to be confirmed.** The box asks once the typing has
 * stopped and a tick asks as it is made.
 *
 * **The box and the ticks are two forms, and each carries what the other
 * holds**, because a form cannot stand inside another.
 */
function Filters({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  const to = href(locale, adminNewsListPath())
  const { form, ask } = useAsk(to)

  return (
    <Stack gap="normal">
      <SearchBox
        action={to}
        name="q"
        value={view.keyword}
        label={t.news.find}
        placeholder={messages.search.boxHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        {view.dating.map((one) => <input key={one} type="hidden" name="dating" value={one} />)}
        {view.ja.map((one) => <input key={one} type="hidden" name="ja" value={one} />)}
        {view.en.map((one) => <input key={one} type="hidden" name="en" value={one} />)}
        <ListingPresented presented={presentation(view, locale)} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <ListingPresented presented={presentation(view, locale)} />
        <Stack gap="normal">
          {/* **An undated announcement is one being written**, so the axis is
              about whether an item is finished rather than about when it ran. */}
          <RefineAxis label={t.news.publishedAt}>
            {NEWS_DATINGS.map((one) => (
              <Checkbox
                key={one}
                label={t.news.datings[one]}
                name="dating"
                value={one}
                checked={view.dating.includes(one)}
                count={view.counts.dating[one]}
              />
            ))}
          </RefineAxis>
          {/* **The two languages are two axes, not one.** They combine as an
              AND, which is what "published in Japanese but not in English" —
              the thing this listing is most often asked — needs. */}
          {(["ja", "en"] as const).map((each) => (
            <RefineAxis key={each} label={t.languages[each]}>
              {NEWS_STATES.map((one) => (
                <Checkbox
                  key={one}
                  label={stateLabel(locale, one)}
                  icon={<StateIcon state={one} />}
                  name={each}
                  value={one}
                  checked={view[each].includes(one)}
                  count={view.counts[each][one]}
                />
              ))}
            </RefineAxis>
          ))}
        </Stack>
      </Form>
    </Stack>
  )
}

/**
 * This listing under a different setting. Everything the reader chose is
 * carried, and the page is the first one unless the page is what changes.
 */
function listingAt(view: ViewProps["view"], locale: Locale, over: Partial<NewsListingQuery>): string {
  return href(locale, adminNewsListPath() + newsQuery({
    keyword: view.keyword,
    dating: view.dating,
    ja: view.ja,
    en: view.en,
    page: 1,
    ...presentedQuery(presentation(view, locale)),
    ...over,
  }))
}

/**
 * How the rows are presented. **Both keys run newest-first in the bare
 * address**, and the title still opens at A: the day is read from the latest
 * and a title from the start of the alphabet.
 */
function presentation(view: ViewProps["view"], locale: Locale): Presentation<NewsSortKey> {
  const t = messagesFor(locale).admin.contents
  // The table names these two columns, so the orders are named by them rather
  // than by a second set of words meaning the same things.
  const names: Record<NewsSortKey, string> = { published: t.news.publishedAt, title: t.title }
  return {
    sort: {
      keys: NEWS_SORT_KEYS,
      current: view.sort,
      order: view.order,
      unwritten: NEWS_SORT,
      runs: () => "desc",
      opens: (key) => key === "title" ? "asc" : "desc",
      name: (key) => names[key],
    },
    size: view.size,
  }
}

/** The count and the way through the pages, over the rows and again under them. */
function paging(view: ViewProps["view"], locale: Locale): ListingPaging {
  return {
    total: view.total,
    from: view.rangeFrom,
    to: view.rangeTo,
    page: view.page,
    pageCount: view.pageCount,
    at: (page) => listingAt(view, locale, { page }),
  }
}
