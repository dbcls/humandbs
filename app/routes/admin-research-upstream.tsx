import { Form, Link } from "react-router"

import {
  BRANCH_SORT,
  BRANCH_SORT_KEYS,
  BRANCH_STANDINGS,
  branchOrder,
  type BranchSortKey,
  branchStanding,
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
  Heading,
  Stack,
} from "~/components/base"
import { Checkbox } from "~/components/form"
import { Flag, KindMark } from "~/components/flags"
import { Card, IdMark, Page, Paging, Table, Td } from "~/components/page"
import { type ListingPaging, ListingPresented, ListingTools, type Presentation, presentedQuery, RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { BranchCells, BranchStandingMark, STANDING_MARK, UpstreamNotConnected } from "~/components/upstream"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"
import { useAsk } from "~/search-as-typed"

import type { Route } from "./+types/admin-research-upstream"

/**
 * Finding the approved application a draft is to be written from.
 *
 * The application system already holds the study's title, its aims, its methods,
 * the people it is about and the accessions it registered, so a research begins
 * from those rather than from an empty form.
 *
 * **This screen only finds the branch.** What taking it in would bring, and
 * which draft it goes into, are answered one screen on — that answer depends on
 * what the portal already holds for the hum, and reading it for every row would
 * be reading it for rows nobody opens.
 *
 * **It is presented the way the other listings are** (`components/search.tsx`):
 * the conditions in a pane at the left, the ordering and the page size over the
 * rows, and every branch that matched counted and paged. What it narrows by is
 * its own — where the branch stands with the portal — because that is the
 * question a curator opens a row to answer.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamResearchPage(request, locale)
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.templates.heading) },
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
                  // The box is never alone in the pane here: the axis stands
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
                      headers={[
                        t.application,
                        t.humLabel,
                        t.standing,
                        t.approvedOn,
                        t.title,
                        t.pi,
                        t.registered,
                      ]}
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
                            {/* **The label, and a way into the research when
                                the portal holds one.** Whether it does is said
                                by the column beside, not by this one — a label
                                that is or is not a link says it only to a
                                reader who tries to press it. The glyph is the
                                one every listing gives a research. */}
                            {row.humLabel === null
                              ? <Flag kind="short">{t.noHumLabel}</Flag>
                              : (
                                  <IdMark kind="research" to={row.heldBy === null ? null : href(locale, adminResearchPath(row.heldBy))}>
                                    {row.humLabel}
                                  </IdMark>
                                )}
                          </Td>
                          <Td nowrap>
                            <BranchStandingMark standing={branchStanding(row)} locale={locale} />
                          </Td>
                          <BranchCells row={row} locale={locale} />
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
        <ListingPresented presented={presentation(view, locale)} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <ListingPresented presented={presentation(view, locale)} />
        <Stack gap="normal">
          <RefineAxis label={t.standing}>
            {BRANCH_STANDINGS.map((standing: BranchStanding) => (
              <Checkbox
                key={standing}
                label={t.standings[standing]}
                icon={<KindMark kind={STANDING_MARK[standing]} />}
                name="standing"
                value={standing}
                checked={view.standings.includes(standing)}
                count={view.counts.standings[standing]}
              />
            ))}
          </RefineAxis>
        </Stack>
      </Form>
    </Stack>
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
    page: 1,
    ...presentedQuery(presentation(view, locale)),
    ...over,
  }))
}

/**
 * How the rows are presented. A key arrives the way that key is read: the
 * newest approval and the first number issued are not the same request.
 */
function presentation(view: ViewProps["view"], locale: Locale): Presentation<BranchSortKey> {
  const t = messagesFor(locale).admin.templates
  return {
    sort: {
      keys: BRANCH_SORT_KEYS,
      current: view.sort,
      order: view.order,
      unwritten: BRANCH_SORT,
      runs: branchOrder,
      name: (key) => t.sort[key],
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
