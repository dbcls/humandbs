import { Form, Link } from "react-router"

import { ADMIN_STATUSES, type AdminStatus } from "~/admin/listing"
import { createResearchAction, researchListPage } from "~/admin/pages.server"
import {
  adminResearchListPath,
  adminResearchPath,
  adminUpstreamResearchPath,
  listingQuery,
  type ListingQuery,
} from "~/admin/urls"
import {
  ButtonLink,
  Chooser,
  CHOOSER_SIDE,
  Clamped,
  Excerpt,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Stack,
  Stated,
} from "~/components/base"
import { Checkbox, Submit } from "~/components/form"
import { Icon, type IconName } from "~/components/icons"
import { Card, ExternalLink, Page, Paging, Table, Td } from "~/components/page"
import { formatSize } from "~/files/box"
import { boxSummariesOf } from "~/files/listing.server"
import { RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { datasetPath, href, readLocale } from "~/public/urls"
import { useAsk } from "~/search-as-typed"
import { PAGE_SIZE, PAGE_SIZES } from "~/search/page-size"
import { DEFAULT_SORT, defaultOrder, SORT_KEYS } from "~/search/sort"

import type { Route } from "./+types/admin-research-list"

/** How many dataset ids a row opens with before it counts the rest. */
const SHOWN_DATASETS = 3

/**
 * The way into everything a curator works on: every research, published or
 * not.
 *
 * The box is a direct lookup rather than the public search — the full-text
 * index only holds what is published, and this listing exists mostly for what
 * is not. **A row says nothing about what is missing**: a research holds several
 * versions and drafts, and a shortcoming belongs to one of them, which the
 * draft's confirmation screen names.
 *
 * **It is presented the way the public listings are** (`components/search.tsx`):
 * the conditions in a pane at the left, the ordering and the page size over the
 * rows, and the same three sizes and three orderings. A curator moves between
 * the two sides all day, and a second set of controls to learn is a second set
 * to get wrong.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const view = await researchListPage(request, locale)
  const boxes = await boxSummariesOf(view.rows)
  return {
    ...view,
    rows: view.rows.map((row) => ({ ...row, box: boxes.get(row.researchId) ?? null })),
  }
}

export async function action({ request }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return createResearchAction(request, locale)
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.research.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.research
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.statuses.length

  // The whole row over the rows, and only the count with the way through the
  // pages under them: a reader who reaches the end of a page is looking for the
  // next one, and the ordering and the page size would send them back to the top.
  const tools = <Tools view={view} locale={locale} />
  const pages = <Pages view={view} locale={locale} />

  return (
    <Page>
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={t.heading}>
            {/* The two ways a research begins, in the words and the order the
                area's front page gives them (`admin/navigation.ts`): a curator
                arriving from there should not have to match a name up. */}
            <ButtonLink
              to={href(locale, adminUpstreamResearchPath())}
              icon={<Icon name="download" />}
            >
              {messages.admin.tasks.research.fromUpstream}
            </ButtonLink>
            <Form method="post">
              <Submit icon={<Icon name="plus" />}>{messages.admin.tasks.research.create}</Submit>
            </Form>
          </Heading>

          <RefinableList
            open={paneOpen}
            busy={busy}
            locale={locale}
            onToggle={togglePane}
            inForce={inForce}
            // The box is never alone in the pane here: the status stands under
            // it whatever the reader has asked for.
            refineHasMore
            refine={<Filters view={view} locale={locale} />}
            tools={tools}
            pages={pages}
            panel={null}
          >
            <Stack gap="normal">
              {/* 9 列あって窓に入り切らないので、行がどれの話かを言う列だけ残す。
                  2 列目以降を固定できるのは 1 列目が mark のときだけ (`page.tsx`
                  の `STUCK`)。 */}
              <Table
                stuck={1}
                headers={[
                  t.columns.humLabel,
                  t.columns.datasets,
                  t.columns.title,
                  t.columns.status,
                  t.columns.versions,
                  t.columns.drafts,
                  t.columns.files,
                  t.columns.published,
                  t.columns.updated,
                ]}
                whenEmpty={t.none}
              >
                {view.rows.map((row) => (
                  <tr key={row.researchId}>
                    <Td stuck={0} nowrap>
                      {/* The same glyph the public listings give the two, so
                          that a curator reads one shape for a research and
                          another for a dataset wherever they are. */}
                      <Icon name="book" aria-hidden="true" className="mr-1 text-ink-muted" />
                      <Link to={href(locale, adminResearchPath(row.researchId))}>
                        {row.humLabel ?? t.unpinned}
                      </Link>
                    </Td>
                    <Td nowrap>
                      {/* **A published dataset opens its public page in a new
                          tab; one that is not out has no page to lead to** and
                          stays a word. The row itself leads to the research
                          these belong to, and a curator reading down the rows
                          loses their place if the page opens here. The mark and
                          the word are the ones every way out of the portal has
                          (`ExternalLink`). */}
                      <Clamped
                        shown={SHOWN_DATASETS}
                        more={(rest) => messages.search.andMore(rest)}
                        less={messages.search.showLess}
                        items={row.datasets.map(({ label, published }) => (
                          // **1 行の中で揃え方を 2 つ持たない。** 外部リンクは
                          // 中身を中心で揃える箱なので、行ごと中心で揃え、字との
                          // 距離はこの行の gap が持つ。箱の載せ方は `top` — 枝番の
                          // 一覧の同じ列と同じ理由 (`admin-research-upstream.tsx`)。
                          <span
                            key={label}
                            className="inline-flex items-center gap-1 align-top text-nowrap"
                          >
                            <Icon name="database" aria-hidden="true" className="text-ink-muted" />
                            {published
                              ? (
                                  <ExternalLink to={href(locale, datasetPath(label))} locale={locale}>
                                    {label}
                                  </ExternalLink>
                                )
                              : label}
                          </span>
                        ))}
                      />
                    </Td>
                    <Td floor="min-w-64">
                      {row.title === ""
                        ? <span className="text-ink-muted">{t.untitled}</span>
                        : (
                            <Excerpt more={messages.search.readMore} less={messages.search.showLess}>
                              {row.title}
                            </Excerpt>
                          )}
                    </Td>
                    <Td nowrap>
                      {/* The glyph says the one thing the status is about —
                          whether a reader can see this — and the word stays
                          beside it, because an eye and a lock are only obvious
                          once you know that is the question.

                          **The pair is not a box of its own.** A box that
                          centres what it holds puts the glyph 0.8px below where
                          the same glyph sits on a line of text, and this row
                          draws that same glyph on the baseline two columns
                          over. The cell already refuses to wrap, so there is
                          nothing for a box to hold together. */}
                      <Stated icon={STATUS_MARK[row.status]}>{t.statuses[row.status]}</Stated>
                    </Td>
                    <Td>{row.publishedVersions}</Td>
                    <Td>{row.draftCount}</Td>
                    <Td nowrap>
                      {/* The two numbers the research's own screen gives for
                          its box, in the same words. A store that did not
                          answer is said rather than left blank: a blank cell
                          in a column of counts reads as nothing there. */}
                      {row.box === null
                        ? <span className="text-ink-muted">{t.filesUnavailable}</span>
                        : messages.admin.files.summary(row.box.count, formatSize(row.box.bytes))}
                    </Td>
                    <Td nowrap>{row.publishedOn}</Td>
                    <Td nowrap>{row.updatedOn}</Td>
                  </tr>
                ))}
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
 * GET forms, so a narrowed listing has an address that can be kept and shared
 * — the same rule the public listings follow. The address carries only the
 * conditions that are set (`search-as-typed.ts` の `conditions`).
 *
 * **Nothing here waits to be confirmed.** The box asks once the typing has
 * stopped and a tick asks as it is made, which is how the public pane answers.
 * A pane that only took effect on a press leaves the rows disagreeing with the
 * conditions above them, and the reader has to press to find out which is true.
 *
 * **The box and the ticks are two forms, and each carries what the other
 * holds.** The box is one control with a submission of its own, and a form
 * cannot stand inside another.
 */
function Filters({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.research
  const to = href(locale, adminResearchListPath())
  const { form, ask } = useAsk(to)

  return (
    <Stack gap="normal">
      <SearchBox
        action={to}
        name="q"
        value={view.keyword}
        label={t.keyword}
        placeholder={messages.search.boxHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        {view.statuses.map((status) => (
          <input key={status} type="hidden" name="status" value={status} />
        ))}
        <Presented view={view} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <Presented view={view} />
        <Stack gap="normal">
          <RefineAxis label={t.status}>
            {ADMIN_STATUSES.map((status: AdminStatus) => (
              <Checkbox
                key={status}
                label={t.statuses[status]}
                icon={<Icon name={STATUS_MARK[status]} aria-hidden="true" className="mr-1 text-ink-muted" />}
                name="status"
                value={status}
                checked={view.statuses.includes(status)}
                count={view.counts.statuses[status]}
              />
            ))}
          </RefineAxis>
        </Stack>
      </Form>
    </Stack>
  )
}

/**
 * The glyph a status is drawn by: the question is who can see this, and an
 * eye or a lock is only obvious once you know that is the question.
 */
const STATUS_MARK: Record<AdminStatus, IconName> = { published: "eye", unpublished: "lock" }

/**
 * How the result is presented, carried across a change of conditions.
 *
 * The ordering and the page size are the reader's rather than the listing's, and
 * dropping them on every tick would make either one unusable. **Only what
 * differs from the default is written**, so an unnarrowed listing is still the
 * bare address.
 */
function Presented({ view }: { view: ViewProps["view"] }) {
  return (
    <>
      {view.sort !== DEFAULT_SORT && <input type="hidden" name="sort" value={view.sort} />}
      {view.order !== defaultOrder(view.sort)
        && <input type="hidden" name="order" value={view.order} />}
      {view.size !== PAGE_SIZE && <input type="hidden" name="size" value={String(view.size)} />}
    </>
  )
}

/**
 * This listing under a different setting. Everything the reader chose is
 * carried, and the page is the first one unless the page is what changes.
 */
function listingAt(view: ViewProps["view"], locale: Locale, over: Partial<ListingQuery>): string {
  return href(locale, adminResearchListPath() + listingQuery({
    keyword: view.keyword,
    statuses: view.statuses,
    page: 1,
    sort: view.sort === DEFAULT_SORT ? null : view.sort,
    order: view.order === defaultOrder(view.sort) ? null : view.order,
    size: view.size === PAGE_SIZE ? null : view.size,
    ...over,
  }))
}

/**
 * How the rows are presented, over the rows: the ordering, how many a page
 * holds, and the way through the pages.
 *
 * **Only what differs from the default is written into the addresses.** A
 * reader who asked for nothing is reading the default, and writing it out would
 * put a setting nobody chose into every link on the page.
 */
function Tools({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const at = (over: Partial<ListingQuery>): string => listingAt(view, locale, over)

  const flipped = view.order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
      <Chooser
        label={messages.search.sort.label}
        value={messages.search.sort[view.sort]}
        beside={(
          <Link
            to={at({ order: flipped === defaultOrder(view.sort) ? null : flipped })}
            aria-label={turn}
            title={turn}
            className={CHOOSER_SIDE}
          >
            {/* The glyph says which way the list runs now, not where it goes. */}
            <Icon name={view.order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
          </Link>
        )}
      >
        {SORT_KEYS.map((option) => (
          <Link
            key={option}
            // A key arrives the way that key is read: newest first and the last
            // identifier issued are not the same request.
            to={at({ sort: option === DEFAULT_SORT ? null : option, order: null })}
            aria-current={option === view.sort ? "true" : undefined}
            className={option === view.sort ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {messages.search.sort[option]}
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
