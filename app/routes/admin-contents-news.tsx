import { Form, Link } from "react-router"

import {
  NEWS_DATINGS,
  NEWS_SORT,
  NEWS_SORT_KEYS,
  PUBLISH_STATES,
  type NewsRow,
  type NewsSortKey,
} from "~/admin/contents"
import { newsListAction, newsListPage } from "~/admin/contents.server"
import { adminNewsListPath, adminNewsPath, newsQuery, type NewsListingQuery } from "~/admin/urls"
import {
  Badge,
  Chooser,
  CHOOSER_SIDE,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Stack,
} from "~/components/base"
import { ResultLine, StateCell, StateIcon } from "~/components/contents"
import { Answered, Checkbox, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Paging, Table, Td } from "~/components/page"
import { RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { minuteOf } from "~/dates"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { pageTitle } from "~/i18n/title"
import { href } from "~/public/urls"
import { useAsk } from "~/search-as-typed"
import { PAGE_SIZE, PAGE_SIZES } from "~/search/page-size"

import type { Route } from "./+types/admin-contents-news"

/**
 * The announcements, newest first, unpublished ones included.
 *
 * **It is presented the way the articles are** — the conditions in a pane at
 * the left, the page size over the rows — because the two screens are the same
 * job on different bodies (docs/editing.md の「サイトコンテンツ」).
 *
 * **There is no ordering to choose**: the date is what the public listing runs
 * on, and an item without one is being written rather than standing at one end
 * of an order somebody picked.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return newsListPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return newsListAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.contents.news.heading) },
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
  const tools = <Tools view={view} locale={locale} />
  const pages = <Pages view={view} locale={locale} />

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
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
      {/* **A date still ahead is marked in this column**, because the date is
          what holds the announcement back — the two language columns say what a
          curator set, and an item can be published in both and still be
          waiting. */}
      <Td nowrap>
        {row.publishedAt === null
          ? <span className="text-ink-muted">{t.news.undated}</span>
          : (
              <span className="inline-flex items-center gap-2">
                {minuteOf(row.publishedAt)}
                {row.scheduled && <Badge tone="accent">{t.news.scheduled}</Badge>}
              </span>
            )}
      </Td>
      <Td nowrap><StateCell state={row.states.ja} locale={locale} /></Td>
      <Td nowrap><StateCell state={row.states.en} locale={locale} /></Td>
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
        <Presented view={view} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <Presented view={view} />
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
              {PUBLISH_STATES.map((one) => (
                <Checkbox
                  key={one}
                  label={one === "published" ? t.published : t.unpublished}
                  icon={<StateIcon published={one === "published"} />}
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
 * How the result is presented, carried across a change of conditions. **Only
 * what differs from the default is written**, so an unnarrowed listing is still
 * the bare address.
 */
function Presented({ view }: { view: ViewProps["view"] }) {
  if (view.size === PAGE_SIZE) return null
  return <input type="hidden" name="size" value={String(view.size)} />
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
    sort: view.sort === NEWS_SORT ? null : view.sort,
    order: view.order === "desc" ? null : view.order,
    size: view.size === PAGE_SIZE ? null : view.size,
    ...over,
  }))
}

/**
 * How the rows are presented, over the rows: how many a page holds, and the way
 * through the pages.
 */
function Tools({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  const at = (over: Partial<NewsListingQuery>): string => listingAt(view, locale, over)

  // The table names these two columns, so the orders are named by them rather
  // than by a second set of words meaning the same things.
  const sortNames: Record<NewsSortKey, string> = {
    published: t.news.publishedAt,
    title: t.title,
  }
  // **The day runs newest first and the title runs A to Z**, so the direction
  // each opens in is the key's own rather than one for the listing.
  const flipped = view.order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
      <Chooser
        label={messages.search.sort.label}
        value={sortNames[view.sort]}
        beside={(
          <Link
            to={at({ order: flipped })}
            aria-label={turn}
            title={turn}
            className={CHOOSER_SIDE}
          >
            {/* The glyph says which way the listing runs now, not where it goes. */}
            <Icon name={view.order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
          </Link>
        )}
      >
        {NEWS_SORT_KEYS.map((option) => (
          <Link
            key={option}
            to={at({ sort: option === NEWS_SORT ? null : option, order: option === "title" ? "asc" : null })}
            aria-current={option === view.sort ? "true" : undefined}
            className={option === view.sort ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {sortNames[option]}
          </Link>
        ))}
      </Chooser>
      <Chooser label={messages.search.pageSize} value={String(view.size)}>
        {PAGE_SIZES.map((option) => (
          <Link
            key={option}
            to={at({ size: option === PAGE_SIZE ? null : option })}
            aria-current={option === view.size ? "true" : undefined}
            className={option === view.size ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {option}
          </Link>
        ))}
      </Chooser>
      <Pages view={view} locale={locale} />
    </div>
  )
}

/**
 * The count and the way through the pages, which stand over the rows and again
 * under them.
 */
function Pages({ view, locale }: ViewProps) {
  return (
    <Paging
      locale={locale}
      total={view.total}
      from={view.rangeFrom}
      to={view.rangeTo}
      page={view.page}
      pageCount={view.pageCount}
      at={(page) => listingAt(view, locale, { page })}
    />
  )
}
