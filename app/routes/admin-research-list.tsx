import { Form } from "react-router"

import { ADMIN_STATUSES, type AdminStatus, FILE_PRESENCES, type FilePresence } from "~/admin/listing"
import { createResearchAction, researchListPage } from "~/admin/pages.server"
import {
  adminResearchListPath,
  adminResearchPath,
  listingQuery,
  type ListingQuery,
} from "~/admin/urls"
import {
  Excerpt,
  Heading,
  Stack,
} from "~/components/base"
import { Flag, type FlagKind, KindIcon, Stated } from "~/components/flags"
import { Checkbox, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, DatasetIds, IdWithIcon, Page, Paging, Table, Td } from "~/components/page"
import { formatSize } from "~/files/prefix"
import { listingSummariesOf } from "~/files/listing.server"
import { DateRange, type ListingPaging, ListingPresented, ListingTools, type Presentation, presentedQuery, RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { datasetPath, href, readLocale } from "~/public/urls"
import { useAsk } from "~/search-as-typed"
import { dateWindows } from "~/search/date-window"
import { DEFAULT_SORT, defaultOrder, SORT_KEYS, type SortKey } from "~/search/sort"

import type { Route } from "./+types/admin-research-list"

/** How many dataset ids a row opens with before it counts the rest. */
const SHOWN_DATASETS = 3

/**
 * The starting screen for everything a curator works on: every research, published or
 * not.
 *
 * The box is a direct lookup rather than the public search — the full-text
 * index only holds what is published, and this listing exists mostly for what
 * is not. **A row implies nothing about what is missing**: a research holds several
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
  const summaries = await listingSummariesOf(view.rows)
  return {
    ...view,
    rows: view.rows.map((row) => ({ ...row, fileSummary: summaries.get(row.researchId) ?? null })),
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

  // Collapsed, the button that reopens the pane shows how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.statuses.length
    + (view.published.from === null && view.published.to === null ? 0 : 1)
    + (view.updated.from === null && view.updated.to === null ? 0 : 1)
    + view.files.length

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
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={t.heading}>
            {/* **Only the empty research is begun here.** One begun from a data
                submission application is begun from that application's own
                screen, which the header's menu reaches. */}
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
            // The box is never alone in the pane here: the status is shown under
            // it whatever the reader has asked for.
            refineHasMore
            refine={<Filters view={view} locale={locale} />}
            tools={tools}
            pages={pages}
            panel={null}
          >
            <Stack gap="normal">
              {/* 9 列あって画面の幅に入り切らないので、行がどれの話かを示す列だけ残す。
                  2 列目以降を固定できるのは 1 列目が icon のときだけ (`page.tsx`
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
                      <IdWithIcon kind="research" to={href(locale, adminResearchPath(row.researchId))}>
                        {row.humLabel ?? <Flag kind="short">{t.unpinned}</Flag>}
                      </IdWithIcon>
                    </Td>
                    <Td nowrap>
                      {/* **A published dataset opens its public page in a new
                          tab; one that is not out has no page to lead to** and
                          stays a word. The row itself leads to the research
                          these belong to, and a curator reading down the rows
                          loses their place if the page opens here. The indicator and
                          the word are the ones every link out of the portal has
                          (`ExternalLink`). */}
                      <DatasetIds
                        shown={SHOWN_DATASETS}
                        newTab
                        locale={locale}
                        items={row.datasets.map(({ label, published }) => ({
                          label,
                          to: published ? href(locale, datasetPath(label)) : null,
                        }))}
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
                      {/* The glyph shows the one thing the status is about —
                          whether a reader can see this — and the word stays
                          beside it, because an eye and a lock are only obvious
                          once you know that is the question.

                          **The pair is not a box of its own.** A box that
                          centres what it holds puts the glyph 0.8px below where
                          the same glyph sits on a line of text, and this row
                          draws that same glyph on the baseline two columns
                          over. The cell already refuses to wrap, so there is
                          nothing for a box to hold together. */}
                      <Stated kind={STATUS_FLAG[row.status]}>{t.statuses[row.status]}</Stated>
                    </Td>
                    {/* **The two counts take only their own width**: a number of
                        one or two digits under a short heading, where the
                        default floor left each as wide as a column of words. */}
                    <Td floor="min-w-0">{row.publishedVersions}</Td>
                    <Td floor="min-w-0">{row.draftCount}</Td>
                    <Td nowrap>
                      {/* The two numbers the research's own screen gives for
                          its prefix, in the same words. A store that did not
                          answer is said rather than left blank: a blank cell
                          in a column of counts reads as nothing there. */}
                      {row.fileSummary === null
                        ? <span className="text-ink-muted">{t.filesUnavailable}</span>
                        : messages.admin.files.summary(row.fileSummary.count, formatSize(row.fileSummary.bytes))}
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
 * — the same rule the public listings follow. The address has only the
 * conditions that are set (`search-as-typed.ts` の `conditions`).
 *
 * **Nothing here waits to be confirmed.** The field sends the query once the typing has
 * stopped, a tick or a window sends it as it is made, and a day sends it the
 * moment it is whole, which is how the public pane responds.
 * A pane that only took effect on a press leaves the rows disagreeing with the
 * conditions above them, and the reader has to press to find out which is true.
 *
 * **The box, the two ranges of days and the ticks are four forms, and each has
 * what the others hold.** The box is one control with a submission of its own,
 * and a form cannot be nested inside another.
 */
function Filters({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.research
  const to = href(locale, adminResearchListPath())
  const { form, ask } = useAsk(to)
  // The same four windows the public dates offer, opening from today and
  // lifting only the range they are over.
  const windows = (range: "published" | "updated") => dateWindows({
    today: view.today,
    from: view[range].from,
    to: view[range].to,
    labels: { all: messages.search.refine.presetAll, years: messages.search.refine.presetYears },
    lifted: listingAt(view, locale, { [`${range}From`]: null, [`${range}To`]: null }),
    opening: (from) => listingAt(view, locale, { [`${range}From`]: from, [`${range}To`]: null }),
  })

  return (
    <Stack gap="normal">
      <SearchBox
        action={to}
        name="q"
        value={view.keyword}
        label={t.keyword}
        placeholder={messages.search.searchHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        <Held view={view} except="keyword" />
        <ListingPresented presented={presentation(view, locale)} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <Held view={view} except="ticks" />
        <ListingPresented presented={presentation(view, locale)} />
        <Stack gap="normal">
          <RefineAxis label={t.status}>
            {ADMIN_STATUSES.map((status: AdminStatus) => (
              <Checkbox
                key={status}
                label={t.statuses[status]}
                icon={<KindIcon kind={STATUS_FLAG[status]} />}
                name="status"
                value={status}
                checked={view.statuses.includes(status)}
                count={view.counts.statuses[status]}
              />
            ))}
          </RefineAxis>
          {/* **The store is asked which researches have a file at all**, and
              when it does not respond the ticks cannot be answered: they are
              shown unpressable with the reason, and a condition already in the
              address is left unapplied (`listing.ts` の `filterResearchRows`). */}
          <RefineAxis label={t.columns.files}>
            {view.counts.files === null
              ? <p className="text-ink-muted text-xs">{t.filesUnknown}</p>
              : FILE_PRESENCES.map((presence: FilePresence) => (
                  <Checkbox
                    key={presence}
                    label={t.filePresence[presence]}
                    name="files"
                    value={presence}
                    checked={view.files.includes(presence)}
                    count={view.counts.files?.[presence]}
                  />
                ))}
          </RefineAxis>
        </Stack>
      </Form>

      {/* **The days are the ones the columns show**: the release date of the
          latest version that is out, and the JST day of the latest change. A
          research never out is outside any range of release days. */}
      {(["published", "updated"] as const).map((range) => (
        <RefineAxis key={range} label={t.columns[range]}>
          <DateRange
            locale={locale}
            action={to}
            windows={windows(range)}
            from={view[range].from ?? ""}
            to={view[range].to ?? ""}
            names={{ from: `${range}From`, to: `${range}To` }}
          >
            <Held view={view} except={range} />
            <ListingPresented presented={presentation(view, locale)} />
          </DateRange>
        </RefineAxis>
      ))}
    </Stack>
  )
}

/**
 * The conditions in force, as hidden fields for a form that sends only one of
 * them — every GET form replaces the whole query, so each carries the rest.
 */
function Held({ view, except }: { view: ViewProps["view"], except: "keyword" | "ticks" | "published" | "updated" }) {
  return (
    <>
      {except !== "keyword" && <input type="hidden" name="q" value={view.keyword} />}
      {except !== "ticks" && view.statuses.map((status) => (
        <input key={status} type="hidden" name="status" value={status} />
      ))}
      {except !== "ticks" && view.files.map((presence) => (
        <input key={presence} type="hidden" name="files" value={presence} />
      ))}
      {(["published", "updated"] as const).filter((range) => range !== except).flatMap((range) => [
        view[range].from === null ? null : <input key={`${range}From`} type="hidden" name={`${range}From`} value={view[range].from} />,
        view[range].to === null ? null : <input key={`${range}To`} type="hidden" name={`${range}To`} value={view[range].to} />,
      ])}
    </>
  )
}

/**
 * The glyph a status is drawn by: the question is who can see this, and an
 * eye or a lock is only obvious once you know that is the question.
 */
const STATUS_FLAG: Record<AdminStatus, FlagKind> = { published: "live", unpublished: "hidden" }

/**
 * This listing under a different setting. Everything the reader chose is
 * kept, and the page is the first one unless the page is what changes.
 */
function listingAt(view: ViewProps["view"], locale: Locale, over: Partial<ListingQuery>): string {
  return href(locale, adminResearchListPath() + listingQuery({
    keyword: view.keyword,
    statuses: view.statuses,
    publishedFrom: view.published.from,
    publishedTo: view.published.to,
    updatedFrom: view.updated.from,
    updatedTo: view.updated.to,
    files: view.files,
    page: 1,
    ...presentedQuery(presentation(view, locale)),
    ...over,
  }))
}

/**
 * How the rows are presented: the public listings' three orderings, read the
 * same way (`app/search/sort.ts`).
 */
function presentation(view: ViewProps["view"], locale: Locale): Presentation<SortKey> {
  const messages = messagesFor(locale)
  return {
    sort: {
      keys: SORT_KEYS,
      current: view.sort,
      order: view.order,
      unwritten: DEFAULT_SORT,
      runs: defaultOrder,
      name: (key) => messages.search.sort[key],
    },
    size: view.size,
  }
}

/** The count and the pagination, over the rows and again under them. */
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
