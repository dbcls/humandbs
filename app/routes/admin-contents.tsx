import { Form, Link } from "react-router"

import {
  entryNames,
  entryStates,
  PUBLISH_STATES,
  VERSIONINGS,
  type TreeEntry,
} from "~/admin/contents"
import { contentsAction, contentsPage } from "~/admin/contents.server"
import {
  adminContentsPath,
  adminDocumentPath,
  adminSeriesPath,
  contentsQuery,
  type ContentsListingQuery,
} from "~/admin/urls"
import { Dialog, Heading, Note, Stack } from "~/components/base"
import { contentsSaid, StateCell, StateIcon } from "~/components/contents"
import { Answer, Checkbox, Field, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Code, Page, Paging, Table, Td } from "~/components/page"
import { type ListingPaging, ListingPresented, ListingTools, type Presentation, presentedQuery, RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { href } from "~/public/urls"
import { useAsk } from "~/search-as-typed"

import type { Route } from "./+types/admin-contents"

/**
 * The articles: the bodies readers hold addresses for, and the pointer each
 * guideline's version-less address has.
 *
 * **One row per address, whether or not it has versions.** The revisions of a
 * guideline hang off its pointer rather than being shown beside it, and what acts
 * on a series as a whole — moving the pointer, adding a revision, retiring the
 * lot — is on the series' own screen.
 *
 * **It is presented the way the research listing is** — the conditions in a
 * pane at the left, the page size over the rows — because a curator moves
 * between the two all day. **There is no ordering to choose**: articles are
 * listed by slug and nothing else, which is the address space rather than a
 * presentation of it.
 *
 * **A version-less address whose current revision is not published in some
 * language is reported above the listing.** That address is baked into
 * submission metadata held elsewhere and has to keep responding, and the pointer
 * is the one way it can stop.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return contentsPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return contentsAction(request)
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.contents.heading) },
    { name: "robots", content: "noindex" },
  ]
}

/**
 * How far in a slug with a path in it is drawn. The depth is the slug's own
 * (`app/admin/contents.ts`), so a narrowed listing indents the same rows the
 * whole one does.
 */
const INDENT = ["", "pl-6", "pl-12", "pl-16"]

export default function AdminContents({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const { locale } = view
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()

  // Collapsed, the button that reopens the pane shows how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.versioning.length
    + view.ja.length
    + view.en.length

  // The whole row over the rows, and only the count with the way through the
  // pages under them: a reader who reaches the end of a page is looking for the
  // next one, and the ordering and the page size would send them back to the top.
  const tools = (
    <ListingTools
      locale={locale}
      presented={presentation(view)}
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
            **The button that makes one is shown with the name of the screen**, as it
            does over the research listing: it is the one thing a reader comes
            here to do that is not "open one of these".

            **It requests in a panel rather than in a row of its own.** A slug is
            the whole of what it takes, and a box for it standing open on the
            screen is a second place to type on a screen whose subject is
            everything else.
          */}
          <Heading title={t.heading}>
            <Form method="post">
              <Dialog
                label={t.addDocument}
                title={t.addDocument}
                icon={<Icon name="plus" />}
                action={() => <Submit intent="create-document" variant="primary" icon={<Icon name="plus" />}>{t.create}</Submit>}
              >
                <Field label={t.slug} name="slug" width="w-full" hint={t.slugHint} />
              </Dialog>
            </Form>
          </Heading>

          {view.unanswered.map((one) => (
            <Note key={one.slug} kind="danger">
              {t.unanswered(one.slug, one.locales.map((each) => t.languages[each]).join(" / "))}
            </Note>
          ))}

          <RefinableList
            open={paneOpen}
            busy={busy}
            locale={locale}
            onToggle={togglePane}
            inForce={inForce}
            // The box is never alone in the pane here: three axes are shown under it
            // whatever the reader has asked for.
            refineHasMore
            refine={<Filters view={view} locale={locale} />}
            tools={tools}
            pages={pages}
            panel={null}
          >
            <Stack gap="normal">
              <Table
                headers={[t.slug, t.title, t.versions, t.languages.ja, t.languages.en]}
                whenEmpty={inForce === 0 ? t.noDocument : t.noMatch}
              >
                {view.rows.map((entry) => (
                  <Row
                    key={entry.kind === "series" ? entry.series.id : entry.document.id}
                    entry={entry}
                    locale={locale}
                  />
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
 * One address. **A series is shown with the state of the revision it points at**, since
 * that is what its address responds with; each revision's own state is on the
 * screen that lists them.
 *
 * **The number of revisions is a number.** What it counts is the column's name,
 * said once at the top rather than on every row that has one.
 */
function Row({ entry, locale }: { entry: TreeEntry, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  const { slug, title } = entryNames(entry)
  const indent = INDENT[Math.min(entry.depth, INDENT.length - 1)] ?? ""
  const to = entry.kind === "document"
    ? adminDocumentPath(entry.document.id)
    : adminSeriesPath(entry.series.id)
  const states = entryStates(entry)

  return (
    <tr>
      <Td nowrap>
        <div className={indent}>
          <Link to={href(locale, to)}><Code>{slug}</Code></Link>
        </div>
      </Td>
      <Td floor="min-w-64">
        {entry.kind === "series" && entry.current === null
          ? <span className="text-ink-muted">{t.noCurrent}</span>
          : title}
      </Td>
      <Td nowrap>{entry.kind === "series" ? entry.series.revisions.length : ""}</Td>
      <Td nowrap><StateCell state={states.ja} locale={locale} /></Td>
      <Td nowrap><StateCell state={states.en} locale={locale} /></Td>
    </tr>
  )
}

/**
 * GET forms, so a narrowed listing has an address that can be kept and shared —
 * the same rule the research listing and the public ones follow.
 *
 * **Nothing here waits to be confirmed.** The field sends the query once the typing has
 * stopped and a tick sends as it is made. A pane that only took effect on a
 * press leaves the rows disagreeing with the conditions above them.
 *
 * **The box and the ticks are two forms, and each has what the other
 * holds**, because a form cannot be shown inside another.
 */
function Filters({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  const to = href(locale, adminContentsPath())
  const { form, ask } = useAsk(to)

  return (
    <Stack gap="normal">
      <SearchBox
        action={to}
        name="q"
        value={view.keyword}
        label={t.find}
        placeholder={messages.search.searchHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        {view.versioning.map((one) => (
          <input key={one} type="hidden" name="versioning" value={one} />
        ))}
        {view.ja.map((one) => <input key={one} type="hidden" name="ja" value={one} />)}
        {view.en.map((one) => <input key={one} type="hidden" name="en" value={one} />)}
        <ListingPresented presented={presentation(view)} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <ListingPresented presented={presentation(view)} />
        <Stack gap="normal">
          <RefineAxis label={t.versions}>
            {VERSIONINGS.map((one) => (
              <Checkbox
                key={one}
                label={t.versionings[one]}
                name="versioning"
                value={one}
                checked={view.versioning.includes(one)}
                count={view.counts.versioning[one]}
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
 * kept, and the page is the first one unless the page is what changes.
 */
function listingAt(view: ViewProps["view"], locale: Locale, over: Partial<ContentsListingQuery>): string {
  return href(locale, adminContentsPath() + contentsQuery({
    keyword: view.keyword,
    versioning: view.versioning,
    ja: view.ja,
    en: view.en,
    page: 1,
    ...presentedQuery(presentation(view)),
    ...over,
  }))
}

/**
 * How the rows are presented: only how many a page holds. **The listing runs by
 * slug and offers no other order** — the order is the address space rather than
 * a presentation of it.
 */
function presentation(view: ViewProps["view"]): Presentation<string> {
  return { size: view.size }
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
