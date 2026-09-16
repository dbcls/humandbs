import { Form, Link } from "react-router"

import { NEWS_DATINGS, PUBLISH_STATES, type NewsRow } from "~/admin/contents"
import { newsListAction, newsListPage } from "~/admin/contents.server"
import { adminNewsListPath, adminNewsPath, newsQuery, type NewsListingQuery } from "~/admin/urls"
import {
  Chooser,
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
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
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

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.dating.length
    + view.ja.length
    + view.en.length

  // The same row over the rows and under them: the listing is scrolled past,
  // and the way to the next page has to be at the end a reader reaches.
  const tools = <Tools view={view} locale={locale} />

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
            busy={false}
            locale={locale}
            onToggle={togglePane}
            inForce={inForce}
            // The box is never alone in the pane here: three axes stand under it
            // whatever the reader has asked for.
            refineHasMore
            refine={<Filters view={view} locale={locale} />}
            tools={tools}
            panel={null}
          >
            <Stack gap="normal">
              <Table
                headers={[t.news.publishedAt, t.title, t.languages.ja, t.languages.en]}
                whenEmpty={inForce === 0 ? t.news.none : t.news.noMatch}
              >
                {view.rows.map((row) => <Row key={row.id} row={row} locale={locale} />)}
              </Table>
              {view.total > 0 && tools}
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
 * **The date is the way in.** It is what an announcement is known by — the
 * titles down the column are a hundred variations of one sentence — so the
 * column a reader scans is the column they press.
 */
function Row({ row, locale }: { row: NewsRow, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  return (
    <tr>
      <Td nowrap>
        <Link to={href(locale, adminNewsPath(row.id))}>
          {row.publishedAt ?? t.news.undated}
        </Link>
      </Td>
      <Td floor="min-w-64">{row.title}</Td>
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
        placeholder={t.news.find}
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
 * How the rows are presented, over the rows and under them: how many a page
 * holds, and the way through the pages.
 */
function Tools({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const at = (over: Partial<NewsListingQuery>): string =>
    href(locale, adminNewsListPath() + newsQuery({
      keyword: view.keyword,
      dating: view.dating,
      ja: view.ja,
      en: view.en,
      page: 1,
      // The listing runs newest first and offers no other order, so there is
      // nothing of the ordering to keep in the address.
      sort: null,
      order: null,
      size: view.size === PAGE_SIZE ? null : view.size,
      ...over,
    }))

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
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
      <Paging
        locale={locale}
        total={view.total}
        from={view.rangeFrom}
        to={view.rangeTo}
        page={view.page}
        pageCount={view.pageCount}
        at={(page) => at({ page })}
      />
    </div>
  )
}
