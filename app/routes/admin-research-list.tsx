import type { ReactNode } from "react"
import { Form, Link } from "react-router"

import {
  ADMIN_FLAG_KEYS,
  ADMIN_STATUSES,
  type AdminFlagKey,
  type AdminStatus,
} from "~/admin/listing"
import { createResearchAction, researchListPage } from "~/admin/pages.server"
import {
  adminResearchListPath,
  adminResearchPath,
  adminUpstreamResearchPath,
  listingQuery,
  type ListingQuery,
} from "~/admin/urls"
import {
  Badge,
  ButtonLink,
  Chooser,
  CHOOSER_SIDE,
  Clamped,
  Excerpt,
  Heading,
  LISTING_CONTROL,
  MENU_ITEM,
  MENU_ITEM_HERE,
  PANE_LABEL,
  PaneHeading,
  Stack,
} from "~/components/base"
import { Checkbox, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Paging, Table, Td } from "~/components/page"
import { RefinableList, SearchBox, usePaneOpen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"
import { useAsk } from "~/search-as-typed"
import { PAGE_SIZE, PAGE_SIZES } from "~/search/page-size"
import { DEFAULT_SORT, defaultOrder, SORT_KEYS } from "~/search/sort"

import type { Route } from "./+types/admin-research-list"

/** How many dataset ids a row opens with before it counts the rest. */
const SHOWN_DATASETS = 3

/**
 * The way into everything a curator works on: every research, published or
 * not, with what it is still missing.
 *
 * The box is a direct lookup rather than the public search — the full-text
 * index only holds what is published, and this listing exists mostly for what
 * is not. The three shortcomings beside it are derived from the content by the
 * same function the rest of the portal uses, so a filter cannot disagree with
 * what the editing screen shows.
 *
 * **It is presented the way the public listings are** (`components/search.tsx`):
 * the conditions in a pane at the left, the ordering and the page size over the
 * rows, and the same three sizes and three orderings. A curator moves between
 * the two sides all day, and a second set of controls to learn is a second set
 * to get wrong.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return researchListPage(request, locale)
}

export async function action({ request }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return createResearchAction(request, locale)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.research.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.research
  const [paneOpen, togglePane] = usePaneOpen()

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.statuses.length
    + view.flags.length
  const folded = inForce === 0
    ? messages.search.refine.heading
    : messages.search.refine.foldedWith(inForce)

  // The same row over the rows and under them: a listing this long is scrolled
  // past, and the way to the next page has to be at the end a reader reaches.
  // **Under an empty result there is no second row** — nothing was scrolled
  // past, there is no page to turn to, and the count would be said twice.
  const tools = <Tools view={view} locale={locale} />

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
              icon={<Icon name="clipboard" />}
            >
              {messages.admin.tasks.research.fromUpstream}
            </ButtonLink>
            <Form method="post">
              <Submit icon={<Icon name="plus" />}>{messages.admin.tasks.research.create}</Submit>
            </Form>
          </Heading>

          <RefinableList
            open={paneOpen}
            busy={false}
            // The box is never alone in the pane here: a status and five
            // shortcomings stand under it whatever the reader has asked for.
            refineHasMore
            heading={(
              <PaneHeading title={messages.search.refine.heading} rule="start">
                <button
                  type="button"
                  onClick={togglePane}
                  aria-expanded="true"
                  className="inline-flex cursor-pointer items-center gap-0.5 font-semibold text-brand text-sm"
                >
                  <Icon name="chevron-left" aria-hidden="true" />
                  {messages.search.refine.fold}
                </button>
              </PaneHeading>
            )}
            closed={(
              // **4px rather than a circle**, which is what the page numbers
              // beside it take: the glyph is 16px in a box of 36, and a round
              // box around something leaving that much air reads as a disc with
              // a mark on it rather than as one of the controls in the row.
              <button
                type="button"
                onClick={togglePane}
                aria-expanded="false"
                aria-label={folded}
                title={folded}
                className={`inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center gap-1 rounded px-2 hover:bg-surface-hover ${LISTING_CONTROL}`}
              >
                <Icon name="filter" aria-hidden="true" />
                {inForce > 0 && (
                  <span className="rounded-full bg-brand px-1.5 font-semibold text-white text-xs">
                    {inForce}
                  </span>
                )}
              </button>
            )}
            refine={<Filters view={view} locale={locale} />}
            tools={tools}
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
                  t.columns.incomplete,
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
                      {/* Not links: a dataset of an unpublished research has no
                          page to lead to, and the row already leads somewhere —
                          to the research these belong to. */}
                      <Clamped
                        shown={SHOWN_DATASETS}
                        more={(rest) => messages.search.andMore(rest)}
                        less={messages.search.showLess}
                        items={row.datasetLabels.map((label) => (
                          <span key={label} className="text-nowrap">
                            <Icon name="database" aria-hidden="true" className="mr-1 text-ink-muted" />
                            {label}
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
                          once you know that is the question. */}
                      <span className="inline-flex items-center">
                        <StatusIcon status={row.status} />
                        {t.statuses[row.status]}
                      </span>
                    </Td>
                    <Td>{row.publishedVersions}</Td>
                    <Td>{row.draftCount}</Td>
                    <Td>
                      {/* **Each badge is a flex item, not a word on a line.**
                          Left on a line it shares the baseline of the columns
                          beside it, and 12px type on a 14px baseline hangs 2px
                          below them — a column of badges that reads as having
                          slipped. Out of the line, the box starts where the
                          cell's own text would. */}
                      <ul className="flex flex-col gap-1">
                        {ADMIN_FLAG_KEYS.filter((flag) => row.flags[flag]).map((flag) => (
                          <li key={flag} className="flex">
                            <Badge tone="accent">{t.flags[flag]}</Badge>
                          </li>
                        ))}
                      </ul>
                    </Td>
                    <Td nowrap>{row.publishedOn}</Td>
                    <Td nowrap>{row.updatedOn}</Td>
                  </tr>
                ))}
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
        {view.flags.map((flag) => (
          <input key={flag} type="hidden" name="flag" value={flag} />
        ))}
        <Presented view={view} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <Presented view={view} />
        <Stack gap="normal">
          <Axis label={t.status}>
            {ADMIN_STATUSES.map((status: AdminStatus) => (
              <Checkbox
                key={status}
                label={t.statuses[status]}
                icon={<StatusIcon status={status} />}
                name="status"
                value={status}
                checked={view.statuses.includes(status)}
              />
            ))}
          </Axis>
          <Axis label={t.incomplete}>
            {ADMIN_FLAG_KEYS.map((flag: AdminFlagKey) => (
              <Checkbox
                key={flag}
                label={t.flags[flag]}
                name="flag"
                value={flag}
                checked={view.flags.includes(flag)}
              />
            ))}
          </Axis>
        </Stack>
      </Form>
    </Stack>
  )
}

/**
 * One thing the listing can be narrowed by, and the boxes it is narrowed with.
 *
 * **It is named the way the public panel names its groups** — the pane's own
 * heading, 8px above what it holds (`components/facets.tsx`) — so that a
 * curator moving between the two sides reads one column, not two arrangements
 * of the same parts.
 */
function Axis({ label, children }: { label: string, children: ReactNode }) {
  return (
    // A `fieldset` rather than a heading and a list, so the question the boxes
    // answer is announced once instead of on each of them (`form.tsx` の
    // `RadioGroup`).
    <fieldset>
      {/* **The step under the name is the legend's own.** A `legend` is drawn
          out of the box's flow rather than as one of its items, so a gap set on
          the box never reaches it and the name would sit on top of the first
          one. */}
      <legend className={`pb-2 ${PANE_LABEL}`}>{label}</legend>
      {/* **The boxes stand in from the name**, the way the public panel sets its
          values in under the group they belong to (`components/facets.tsx`) —
          the name says what the group is, and what is in it is one step inside. */}
      <div className="flex flex-col gap-2 pl-2">{children}</div>
    </fieldset>
  )
}

/**
 * The glyph the two statuses are drawn by.
 *
 * **The same pair in the pane and down the table**, so that the shape a curator
 * narrows by is the shape they then read in the rows. The word stays beside it
 * in both places — an eye and a lock are only obvious once you know that the
 * question is who can see this.
 */
function StatusIcon({ status }: { status: AdminStatus }) {
  return (
    <Icon
      name={status === "published" ? "eye" : "lock"}
      aria-hidden="true"
      className="mr-1 text-ink-muted"
    />
  )
}

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
 * How the rows are presented, over the rows and under them: the ordering, how
 * many a page holds, and the way through the pages.
 *
 * **Only what differs from the default is written into the addresses.** A
 * reader who asked for nothing is reading the default, and writing it out would
 * put a setting nobody chose into every link on the page.
 */
function Tools({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const at = (over: Partial<ListingQuery>): string =>
    href(locale, adminResearchListPath() + listingQuery({
      keyword: view.keyword,
      statuses: view.statuses,
      flags: view.flags,
      page: 1,
      sort: view.sort === DEFAULT_SORT ? null : view.sort,
      order: view.order === defaultOrder(view.sort) ? null : view.order,
      size: view.size === PAGE_SIZE ? null : view.size,
      ...over,
    }))

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
