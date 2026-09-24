import { data, Form, Link } from "react-router"

import {
  adminContentFilesPath,
  contentFileUploadPath,
  filesQuery,
  type FilesListingQuery,
} from "~/admin/urls"
import {
  Chooser,
  CHOOSER_SIDE,
  Confirm,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Note,
  Stack,
} from "~/components/base"
import { SlugEditor } from "~/components/contents"
import { CopyAddress, UploadPanel } from "~/components/files"
import { Answered, Result } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Code, ExternalLink, Page, Paging, Table, Td } from "~/components/page"
import { DateRange, RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { dayInJst } from "~/dates"
import { BOX_SORT, BOX_SORT_KEYS, formatSize, type StoredNode } from "~/files/box"
import {
  commonFilesAction,
  commonFilesPage,
  type CommonFilesView,
  type FilesActionResult,
} from "~/files/pages.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
import { PAGE_SIZE, PAGE_SIZES } from "~/search/page-size"
import { dateWindows } from "~/search/date-window"
import { filePath, href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-contents-files"

/**
 * The `common/` box: the images and PDFs a document body links to.
 *
 * **There is no private side and nothing to switch.** This box belongs to no
 * research, and a file put here is fetchable from that moment — which is why
 * both putting one in and taking one out are written into the audit trail,
 * unlike an upload into a research's box (docs/publishing.md の「証跡」).
 *
 * **The screen is the way in and the box.** A heading over a single upload
 * panel, and under it the one table with the pane the other listings carry: the
 * box is looked through by the slug a body links and by the day a file was
 * written, which are the two things a row says that a curator can have in mind
 * (docs/files.md の「画面」).
 *
 * A body links to a file by writing its address, and nothing keeps that link
 * alive: deleting a file — or giving it a different slug — leaves whatever
 * pointed at the old address pointing at nothing.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return commonFilesPage(request, locale)
}

export async function action({ request }: Route.ActionArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  const answer = await commonFilesAction(request, locale)
  return answer instanceof Response ? answer : data(answer, { status: 400 })
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.contents.files.heading) },
    { name: "robots", content: "noindex" },
  ]
}

/**
 * What went wrong, in the words of this screen.
 *
 * `no-box` cannot be reached here — this box has no hum label to be waiting for,
 * unlike a research's (`~/files/pages.server.ts`).
 */
function refusal(answer: FilesActionResult, locale: Locale): string {
  const t = messagesFor(locale).admin.contents.files
  if (answer.status === "malformed-slug") return t.malformedSlug
  if (answer.status === "slug-taken") return t.slugTaken
  return t.nothingSelected
}

export default function AdminContentsFiles({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const { locale } = view
  const messages = messagesFor(locale)
  const t = messages.admin.contents.files
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen. **The
  // two ends of the range are one condition**: the reader asked one question
  // about the day, however many ends they gave it.
  const inForce = (view.keyword === "" ? 0 : 1)
    + (view.from === null && view.to === null ? 0 : 1)

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        {actionData !== undefined && <Result ok={false}>{refusal(actionData, locale)}</Result>}
      </Answered>
      {/* **節を 1 つも持たない画面なので、h1 の下は節と節の距離ではない**
          (`docs/ui.md` の「縦の間隔」)。下に来るのは upload の枠そのもので、枠は
          自分の余白を持つ — 32px を空けると字から字までが 48px になり、h1 だけが
          浮いて見える。 */}
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={t.heading} note={t.note} />

          <UploadPanel
            locale={locale}
            endpoint={contentFileUploadPath()}
            threshold={view.multipartThreshold}
            partSize={view.partSize}
          />

          {/* The store did not answer, which is not the same as an empty box —
              so it is said as a failure rather than in the place a reason for
              nothing goes. */}
          {view.rows === null
            ? <Note kind="danger">{t.failed}</Note>
            : (
                <RefinableList
                  open={paneOpen}
                  busy={busy}
                  locale={locale}
                  onToggle={togglePane}
                  inForce={inForce}
                  // The box is never alone in the pane here: the range of days
                  // stands under it whatever the reader has asked for.
                  refineHasMore
                  refine={<Filters view={view} locale={locale} />}
                  tools={<Tools view={view} locale={locale} />}
                  pages={<Pages view={view} locale={locale} />}
                  panel={null}
                >
                  <Table
                    align="middle"
                    headers={[
                      t.slug,
                      t.size,
                      t.updatedAt,
                      /* The column of things to press names itself for anyone
                         reading the row aloud and nowhere else: a word over a
                         column of marks is a heading for something already
                         said, and it drags the column off its own width. */
                      <span key="actions" className="sr-only">{messages.admin.actions}</span>,
                    ]}
                    whenEmpty={inForce === 0 ? t.none : t.noMatch}
                  >
                    {view.rows.map((row) => (
                      <Row key={row.name} row={row} locale={locale} />
                    ))}
                  </Table>
                </RefinableList>
              )}
        </Stack>
      </Card>
    </Page>
  )
}

interface ViewProps {
  view: CommonFilesView
  locale: Locale
}

/**
 * This listing under a different setting.
 *
 * **What is at its default is left out of the address** (`admin/urls.ts` の
 * `filesQuery`). A reader who asked for nothing is reading a bare address, and
 * the link they copy out of the bar carries no setting they never chose.
 *
 * **Changing anything but the page goes back to the first one.** Page 7 of an
 * ordering nobody has seen yet is not where anyone meant to land.
 */
function at(view: CommonFilesView, over: Partial<FilesListingQuery>): string {
  return href(view.locale, adminContentFilesPath() + filesQuery({
    keyword: view.keyword,
    from: view.from,
    to: view.to,
    page: 1,
    sort: view.sort === BOX_SORT ? null : view.sort,
    order: view.order === "asc" ? null : view.order,
    size: view.size === PAGE_SIZE ? null : view.size,
    ...over,
  }))
}

/**
 * GET forms, so a narrowed box has an address that can be kept and shared —
 * the rule every listing follows.
 *
 * **Nothing here waits to be confirmed.** The box asks once the typing has
 * stopped, a window asks as it is pressed, and a day asks the moment it is
 * whole.
 *
 * **The box and the days are two forms, and each carries what the other
 * holds**, because a form cannot stand inside another.
 */
function Filters({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents.files
  const to = href(locale, adminContentFilesPath())
  // The same four windows the public dates offer, opening from today and
  // lifting only the days — the words typed stay in force.
  const windows = dateWindows({
    today: view.today,
    from: view.from,
    to: view.to,
    labels: { all: messages.search.refine.presetAll, years: messages.search.refine.presetYears },
    lifted: at(view, { from: null, to: null }),
    opening: (from) => at(view, { from, to: null }),
  })

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
        {view.from !== null && <input type="hidden" name="from" value={view.from} />}
        {view.to !== null && <input type="hidden" name="to" value={view.to} />}
        <Presented view={view} />
      </SearchBox>

      {/* **The day is the one the column shows** — the JST day the file was
          written — so a range set against the days a reader can read keeps
          exactly the rows they can see fall inside it (`files/box.ts` の
          `narrowedBox`). Either end may be left open. */}
      <RefineAxis label={t.sortKeys.updated}>
        <DateRange locale={locale} action={to} windows={windows} from={view.from ?? ""} to={view.to ?? ""}>
          <input type="hidden" name="q" value={view.keyword} />
          <Presented view={view} />
        </DateRange>
      </RefineAxis>
    </Stack>
  )
}

/**
 * How the result is presented, carried across a change of conditions. **Only
 * what differs from the default is written**, so an unnarrowed box is still the
 * bare address.
 */
function Presented({ view }: { view: CommonFilesView }) {
  return (
    <>
      {view.sort !== BOX_SORT && <input type="hidden" name="sort" value={view.sort} />}
      {view.order !== "asc" && <input type="hidden" name="order" value={view.order} />}
      {view.size !== PAGE_SIZE && <input type="hidden" name="size" value={String(view.size)} />}
    </>
  )
}

/**
 * How the box is read: in what order, how much of it at a time, and which part
 * of it is on screen.
 *
 * **The same four the research listing carries**, in the same place and the
 * same shape — a box of files and a list of research are both listings, and a
 * reader who learned the controls on one should not have to find them again.
 */
function Tools({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents.files
  const flipped = view.order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
      <Chooser
        label={messages.search.sort.label}
        value={t.sortKeys[view.sort]}
        beside={(
          <Link
            to={at(view, { order: flipped === "asc" ? null : flipped })}
            aria-label={turn}
            title={turn}
            className={CHOOSER_SIDE}
          >
            {/* The glyph says which way the list runs now, not where it goes. */}
            <Icon name={view.order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
          </Link>
        )}
      >
        {BOX_SORT_KEYS.map((option) => (
          <Link
            key={option}
            to={at(view, { sort: option === BOX_SORT ? null : option, order: null })}
            aria-current={option === view.sort ? "true" : undefined}
            className={option === view.sort ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {t.sortKeys[option]}
          </Link>
        ))}
      </Chooser>
      <Chooser label={messages.search.pageSize} value={String(view.size)}>
        {PAGE_SIZES.map((option) => (
          <Link
            key={option}
            to={at(view, { size: option === PAGE_SIZE ? null : option })}
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
 * The count and the way through the pages, which stand over the table and again
 * under it.
 *
 * **Only these stand under it.** A page of files is longer than the window, so
 * a reader who has decided against this page would otherwise have to climb back
 * over it to reach the next one — but the ordering and the page size send that
 * reader back to the top of page one, and have no business at the foot.
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
      at={(page) => at(view, { page })}
    />
  )
}

/**
 * One file.
 *
 * **The slug is the row**: it is the address readers hold, minus the part every
 * file here shares. The whole address is what a body needs, so it is on the
 * button that copies rather than in a column that repeats the slug with a
 * prefix in front of it. **It is also the way to the file itself** — this box
 * is public from the moment something is put in it, so the address always
 * answers, and letting the browser decide what to do with what comes back is
 * the only answer that fits a box holding documents and spreadsheets alike.
 *
 * **The day is the JST day**, as every day on a row is: an upload made at nine
 * in the morning is on the day the curator made it, not on the UTC day before.
 *
 * **Both acts are on the row they act on.** Ticking a column and then pressing
 * something at the foot of the table is a way to delete the wrong file — the
 * thing pressed names nothing, and the rows it was chosen from have scrolled.
 */
function Row({ row, locale }: { row: StoredNode, locale: Locale }) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents.files
  const address = filePath("common", row.name)

  return (
    <tr>
      <Td>
        <ExternalLink to={address} locale={locale}><Code size="xs">{row.name}</Code></ExternalLink>
      </Td>
      <Td nowrap>{formatSize(row.size)}</Td>
      <Td nowrap>{dayInJst(row.updatedAt)}</Td>
      <Td nowrap holds="control">
        <span className="flex items-center gap-1">
          <CopyAddress address={address} locale={locale} />
          <Form method="post">
            <input type="hidden" name="from" value={row.name} />
            {/* Everything standing in a row is the row's size, not the
                page's (`docs/ui.md` の「押せるものの大きさ」). */}
            {/* **Moving the address is the break deleting it makes.** The
                object does not move within the bucket: the file is copied to
                the new key and the old one is deleted, and the trail writes it
                as exactly that. So the way in wears the same face as the way to
                delete beside it — the panel is the one every slug is changed
                in, and only the rule under the box is this box's own. */}
            <SlugEditor
              locale={locale}
              intent="rename"
              name="to"
              value={row.name}
              hint={t.renameHint}
              size="row"
            />
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="name" value={row.name} />
            <Confirm
              label={t.removeFile}
              title={t.removeFileTitle(row.name)}
              warning={t.removeFileWarning}
              confirm={t.removeFileConfirm}
              cancel={messages.admin.contents.cancel}
              size="row"
            />
          </Form>
        </span>
      </Td>
    </tr>
  )
}
