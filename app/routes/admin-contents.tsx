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
import {
  Button,
  Chooser,
  Dialog,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Stack,
} from "~/components/base"
import { ResultLine, StateCell, StateIcon } from "~/components/contents"
import { Answered, Checkbox, Field, Result, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Paging, Table, Td } from "~/components/page"
import { RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href } from "~/public/urls"
import { useAsk } from "~/search-as-typed"
import { PAGE_SIZE, PAGE_SIZES } from "~/search/page-size"

import type { Route } from "./+types/admin-contents"

/**
 * The articles: the bodies readers hold addresses for, and the pointer each
 * guideline's version-less address carries.
 *
 * **One row per address, whether or not it has versions.** The revisions of a
 * guideline hang off its pointer rather than standing beside it, and what acts
 * on a series as a whole — moving the pointer, adding a revision, retiring the
 * lot — is on the series' own screen.
 *
 * **It is presented the way the research listing is** — the conditions in a
 * pane at the left, the page size over the rows — because a curator moves
 * between the two all day. **There is no ordering to choose**: articles are
 * listed by slug and nothing else, which is the address space rather than a
 * presentation of it (docs/editing.md の「サイトコンテンツ」).
 *
 * **A version-less address whose current revision is not published in some
 * language is reported above the listing.** That address is baked into
 * submission metadata held elsewhere and has to keep answering, and the pointer
 * is the one way it can stop (docs/editing.md の「サイトコンテンツ」).
 */
export async function loader({ request }: Route.LoaderArgs) {
  return contentsPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return contentsAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.contents.heading) },
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

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.versioning.length
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
            does over the research listing: it is the one thing a reader comes
            here to do that is not "open one of these".

            **It asks in a panel rather than in a row of its own.** A slug is
            the whole of what it takes, and a box for it standing open on the
            screen is a second place to type on a screen whose subject is
            everything else.
          */}
          <Heading title={t.heading}>
            <Form method="post">
              <input type="hidden" name="intent" value="create-document" />
              <Dialog label={t.addDocument} title={t.addDocument} icon={<Icon name="plus" />}>
                {(close) => (
                  <Stack gap="normal">
                    <Field label={t.slug} name="slug" width="w-full" hint={t.slugHint} />
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={close}>{t.cancel}</Button>
                      <Submit variant="primary" icon={<Icon name="plus" />}>{t.create}</Submit>
                    </span>
                  </Stack>
                )}
              </Dialog>
            </Form>
          </Heading>

          {view.unanswered.map((one) => (
            <Result key={one.slug} ok={false}>
              {t.unanswered(one.slug, one.locales.map((each) => t.languages[each]).join(" / "))}
            </Result>
          ))}

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
 * One address. **A series wears the state of the revision it points at**, since
 * that is what its address answers with; each revision's own state is on the
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
          <Link to={href(locale, to)}><code>{slug}</code></Link>
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
 * **Nothing here waits to be confirmed.** The box asks once the typing has
 * stopped and a tick asks as it is made. A pane that only took effect on a
 * press leaves the rows disagreeing with the conditions above them.
 *
 * **The box and the ticks are two forms, and each carries what the other
 * holds**, because a form cannot stand inside another.
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
        placeholder={messages.search.boxHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        {view.versioning.map((one) => (
          <input key={one} type="hidden" name="versioning" value={one} />
        ))}
        {view.ja.map((one) => <input key={one} type="hidden" name="ja" value={one} />)}
        {view.en.map((one) => <input key={one} type="hidden" name="en" value={one} />)}
        <Presented view={view} />
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <Presented view={view} />
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
  const at = (over: Partial<ContentsListingQuery>): string =>
    href(locale, adminContentsPath() + contentsQuery({
      keyword: view.keyword,
      versioning: view.versioning,
      ja: view.ja,
      en: view.en,
      page: 1,
      // The listing runs by slug and offers no other order, so there is nothing
      // of the ordering to keep in the address.
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
