import { Form, Link } from "react-router"

import {
  BRANCH_REGISTRATIONS,
  BRANCH_SORT,
  BRANCH_SORT_KEYS,
  BRANCH_STANDINGS,
  branchOrder,
  type BranchRegistration,
  type BranchStanding,
} from "~/admin/listing"
import { upstreamResearchPage } from "~/admin/templates.server"
import {
  adminResearchPath,
  adminUpstreamBranchPath,
  adminUpstreamResearchPath,
  branchListingQuery,
  type BranchListingQuery,
} from "~/admin/urls"
import {
  Chooser,
  CHOOSER_SIDE,
  Clamped,
  Excerpt,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Stack,
} from "~/components/base"
import { Checkbox } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, ExternalLink, Page, Paging, Table, Td } from "~/components/page"
import { RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { UpstreamNotConnected } from "~/components/upstream"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { pageTitle } from "~/i18n/title"
import { href, jgaEntryUrl, readLocale } from "~/public/urls"
import { useAsk } from "~/search-as-typed"
import { PAGE_SIZE, PAGE_SIZES } from "~/search/page-size"

import type { Route } from "./+types/admin-research-upstream"

/** How many datasets a row opens with before it counts the rest. */
const SHOWN_DATASETS = 3

/**
 * Finding the approved application a draft is to be written from.
 *
 * The application system already holds the study's title, its aims, its methods,
 * the people it is about and the accessions it registered, so a research begins
 * from those rather than from an empty form
 * (docs/editing.md の「下書きを外から作る」).
 *
 * **This screen only finds the branch.** What taking it in would bring, and
 * which draft it goes into, are answered one screen on — that answer depends on
 * what the portal already holds for the hum, and reading it for every row would
 * be reading it for rows nobody opens.
 *
 * **It is presented the way the other listings are** (`components/search.tsx`):
 * the conditions in a pane at the left, the ordering and the page size over the
 * rows, and every branch that matched counted and paged. What it narrows by is
 * its own — where the branch stands with the portal, and whether it has
 * registered anything yet — because those are the two questions a curator opens
 * a row to answer.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamResearchPage(request, locale)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.templates.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchUpstream({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.standings.length
    + view.registrations.length

  // The whole row over the rows, and only the count with the way through the
  // pages under them: a reader who reaches the end of a page is looking for the
  // next one, and the ordering and the page size would send them back to the top.
  const tools = <Tools view={view} locale={locale} />
  const pages = <Pages view={view} locale={locale} />

  return (
    <Page>
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={t.heading} />

          {!view.connected
            ? <UpstreamNotConnected locale={locale} />
            : (
                <RefinableList
                  open={paneOpen}
                  busy={busy}
                  locale={locale}
                  onToggle={togglePane}
                  inForce={inForce}
                  // The box is never alone in the pane here: two axes stand
                  // under it whatever the reader has asked for.
                  refineHasMore
                  refine={<Filters view={view} locale={locale} />}
                  tools={tools}
                  pages={pages}
                  panel={null}
                >
                  <Stack gap="normal">
                    {/* **行がどれの話かを言う列だけ残して固定する。** 題目の列が
                        窓を越えるまで広がるので、横に送ると先頭の ID が出ていって
                        しまう。固定できるのは先頭の列で (`page.tsx` の `STUCK`)、
                        それがこの表の主役でもある。 */}
                    <Table
                      stuck={1}
                      headers={[t.application, t.humLabel, t.approvedOn, t.title, t.pi, t.registered]}
                      whenEmpty={t.none}
                    >
                      {view.rows.map((row) => (
                        <tr key={row.applicationId}>
                          <Td stuck={0} nowrap>
                            <Link to={href(locale, adminUpstreamBranchPath(row.applicationId))}>
                              {row.applicationId}
                            </Link>
                          </Td>
                          <Td nowrap>
                            {/* **The three ways this cell reads are the three
                                standings the pane narrows by** — a way into the
                                research, a number the portal does not hold, and
                                no number at all. The glyph is the one every
                                listing gives a research. */}
                            {row.humLabel === null
                              ? <span className="text-ink-muted">{t.noHumLabel}</span>
                              : (
                                  <>
                                    <Icon
                                      name="book"
                                      aria-hidden="true"
                                      className="mr-1 text-ink-muted"
                                    />
                                    {row.heldBy === null
                                      ? row.humLabel
                                      : (
                                          <Link to={href(locale, adminResearchPath(row.heldBy))}>
                                            {row.humLabel}
                                          </Link>
                                        )}
                                  </>
                                )}
                          </Td>
                          <Td nowrap>{row.approvedOn ?? ""}</Td>
                          <Td floor="min-w-64">
                            <Excerpt more={messages.search.readMore} less={messages.search.showLess}>
                              {row.titleJa === "" ? row.titleEn : row.titleJa}
                            </Excerpt>
                          </Td>
                          <Td nowrap>{row.piName}</Td>
                          <Td>
                            {/* **The archive is where a dataset is described**,
                                and a branch is often approved before the ones it
                                registered are published, so the portal has
                                nothing to show of them yet (`public/urls.ts` の
                                `jgaEntryUrl`). */}
                            <Clamped
                              shown={SHOWN_DATASETS}
                              more={(rest) => messages.search.andMore(rest)}
                              less={messages.search.showLess}
                              items={row.datasets.map((accession) => (
                                // **1 行の中で揃え方を 2 つ持たない。** 外部リンク
                                // は中身を中心で揃える箱なので、その隣のアイコンを
                                // baseline に載せると印だけが 0.8px 上に浮く。行ごと
                                // 中心で揃え、字との距離はこの行の gap が持つ。
                                //
                                // **箱の載せ方は `top`。** 中身を中心で揃える箱は
                                // baseline を中の字から取るので、行の baseline とは
                                // ずれる — 載せたままだと行の高さが 22.4px から
                                // 25.3px に伸び、この列だけ表の行送りから外れる。
                                // 箱の高さは行の高さと同じなので、上で載せると中身は
                                // 動かずに行だけ元に戻る。
                                <span
                                  key={accession}
                                  className="inline-flex items-center gap-1 align-top text-nowrap"
                                >
                                  <Icon name="database" aria-hidden="true" className="text-ink-muted" />
                                  <ExternalLink to={jgaEntryUrl(accession)} locale={locale}>
                                    {accession}
                                  </ExternalLink>
                                </span>
                              ))}
                            />
                          </Td>
                        </tr>
                      ))}
                    </Table>
                  </Stack>
                </RefinableList>
              )}
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
 * GET forms, so a narrowed listing has an address that can be kept and shared,
 * and nothing here waits to be confirmed — the same pane the research listing
 * has (`routes/admin-research-list.tsx`).
 *
 * **The box and the ticks are two forms, and each carries what the other
 * holds**, because the box is one control with a submission of its own and a
 * form cannot stand inside another.
 */
function Filters({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const to = href(locale, adminUpstreamResearchPath())
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
        {view.standings.map((standing) => (
          <input key={standing} type="hidden" name="standing" value={standing} />
        ))}
        {view.registrations.map((registration) => (
          <input key={registration} type="hidden" name="registered" value={registration} />
        ))}
        <Presented view={view} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <Presented view={view} />
        <Stack gap="normal">
          <RefineAxis label={t.standing}>
            {BRANCH_STANDINGS.map((standing: BranchStanding) => (
              <Checkbox
                key={standing}
                label={t.standings[standing]}
                name="standing"
                value={standing}
                checked={view.standings.includes(standing)}
                count={view.counts.standings[standing]}
              />
            ))}
          </RefineAxis>
          <RefineAxis label={t.registration}>
            {BRANCH_REGISTRATIONS.map((registration: BranchRegistration) => (
              <Checkbox
                key={registration}
                label={t.registrations[registration]}
                name="registered"
                value={registration}
                checked={view.registrations.includes(registration)}
                count={view.counts.registrations[registration]}
              />
            ))}
          </RefineAxis>
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
  return (
    <>
      {view.sort !== BRANCH_SORT && <input type="hidden" name="sort" value={view.sort} />}
      {view.order !== branchOrder(view.sort)
        && <input type="hidden" name="order" value={view.order} />}
      {view.size !== PAGE_SIZE && <input type="hidden" name="size" value={String(view.size)} />}
    </>
  )
}

/**
 * This listing under a different setting. Everything the reader chose is
 * carried, and the page is the first one unless the page is what changes.
 */
function listingAt(view: ViewProps["view"], locale: Locale, over: Partial<BranchListingQuery>): string {
  return href(locale, adminUpstreamResearchPath() + branchListingQuery({
    keyword: view.keyword,
    standings: view.standings,
    registrations: view.registrations,
    page: 1,
    sort: view.sort === BRANCH_SORT ? null : view.sort,
    order: view.order === branchOrder(view.sort) ? null : view.order,
    size: view.size === PAGE_SIZE ? null : view.size,
    ...over,
  }))
}

/**
 * How the rows are presented, over the rows: the ordering, how many a page
 * holds, and the way through the pages.
 */
function Tools({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const at = (over: Partial<BranchListingQuery>): string => listingAt(view, locale, over)

  const flipped = view.order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
      <Chooser
        label={messages.search.sort.label}
        value={t.sort[view.sort]}
        beside={(
          <Link
            to={at({ order: flipped === branchOrder(view.sort) ? null : flipped })}
            aria-label={turn}
            title={turn}
            className={CHOOSER_SIDE}
          >
            {/* The glyph says which way the list runs now, not where it goes. */}
            <Icon name={view.order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
          </Link>
        )}
      >
        {BRANCH_SORT_KEYS.map((option) => (
          <Link
            key={option}
            // A key arrives the way that key is read: the newest approval and
            // the first number issued are not the same request.
            to={at({ sort: option === BRANCH_SORT ? null : option, order: null })}
            aria-current={option === view.sort ? "true" : undefined}
            className={option === view.sort ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {t.sort[option]}
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
