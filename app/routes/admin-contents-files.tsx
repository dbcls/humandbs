import { data, Form } from "react-router"

import {
  adminContentFilesPath,
  contentFileUploadPath,
  filesQuery,
  type FilesListingQuery,
} from "~/admin/urls"
import {
  Confirm,
  Heading,
  Note,
  Stack,
} from "~/components/base"
import { SlugEditor } from "~/components/contents"
import { CopyAddress, UploadPanel } from "~/components/files"
import { Answer } from "~/components/form"
import { Card, Code, ExternalLink, Page, Paging, Table, Td } from "~/components/page"
import { DateRange, type ListingPaging, ListingPresented, ListingTools, type Presentation, presentedQuery, RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { dayInJst } from "~/dates"
import { FILE_SORT, FILE_SORT_KEYS, type FileSortKey, formatSize, type StoredNode } from "~/files/prefix"
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
import { dateWindows } from "~/search/date-window"
import { filePath, href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-contents-files"

/**
 * The `common/` prefix: the images and PDFs a document body links to.
 *
 * **There is no private side and nothing to switch.** This prefix belongs to no
 * research, and a file put here is fetchable from that moment — which is why
 * both putting one in and taking one out are written into the audit trail,
 * unlike an upload into a research's prefix.
 *
 * **The screen is the upload control and the prefix.** A heading over a single upload
 * panel, and under it the one table with the pane the other listings have: the
 * prefix is looked through by the slug a body links and by the day a file was
 * written, which are the two things a row means that a curator can have in
 * mind.
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
 * `no-hum-label` cannot be reached here — this prefix has no hum label to be waiting for,
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

  // Collapsed, the button that reopens the pane shows how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen. **The
  // two ends of the range are one condition**: the reader asked one question
  // about the day, however many ends they gave it.
  const inForce = (view.keyword === "" ? 0 : 1)
    + (view.from === null && view.to === null ? 0 : 1)

  return (
    <Page>
      <Answer answer={actionData} locale={locale} said={(answer) => refusal(answer, locale)} />
      {/* **節を 1 つも持たない画面なので、h1 の下は節と節の距離ではない**。
          下に来るのはアップロード欄そのもので、アップロード欄には自前の余白がある — 32px を空けると
          字から字までが 48px になり、h1 だけが離れて見える。 */}
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={t.heading} note={t.note} />

          <UploadPanel
            locale={locale}
            endpoint={contentFileUploadPath()}
            threshold={view.multipartThreshold}
            partSize={view.partSize}
          />

          {/* The store did not respond, which is not the same as an empty prefix —
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
                  // is shown under it whatever the reader has asked for.
                  refineHasMore
                  refine={<Filters view={view} locale={locale} />}
                  tools={(
                    <ListingTools
                      locale={locale}
                      presented={presentation(view, locale)}
                      at={(presented) => at(view, presented)}
                      paging={paging(view)}
                    />
                  )}
                  pages={<Paging locale={locale} {...paging(view)} />}
                  panel={null}
                >
                  <Table
                    actions
                    align="middle"
                    headers={[
                      t.slug,
                      t.size,
                      t.updatedAt,
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
 * the link they copy out of the bar has no setting they never chose.
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
    ...presentedQuery(presentation(view, view.locale)),
    ...over,
  }))
}

/**
 * GET forms, so a narrowed prefix has an address that can be kept and shared —
 * the rule every listing follows.
 *
 * **Nothing here waits to be confirmed.** The field sends the query once the typing has
 * stopped, a window sends as it is pressed, and a day sends the moment it is
 * whole.
 *
 * **The box and the days are two forms, and each has what the other
 * holds**, because a form cannot be shown inside another.
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
        placeholder={messages.search.searchHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        {view.from !== null && <input type="hidden" name="from" value={view.from} />}
        {view.to !== null && <input type="hidden" name="to" value={view.to} />}
        <ListingPresented presented={presentation(view, locale)} />
      </SearchBox>

      {/* **The day is the one the column shows** — the JST day the file was
          written — so a range set against the days a reader can read keeps
          exactly the rows they can see fall inside it (`files/prefix.ts` の
          `narrowedFiles`). Either end may be left open. */}
      <RefineAxis label={t.sortKeys.updated}>
        <DateRange locale={locale} action={to} windows={windows} from={view.from ?? ""} to={view.to ?? ""}>
          <input type="hidden" name="q" value={view.keyword} />
          <ListingPresented presented={presentation(view, locale)} />
        </DateRange>
      </RefineAxis>
    </Stack>
  )
}

/**
 * How the prefix is read: in what order and how much of it at a time — the same
 * tools the research listing has, in the same place and the same shape.
 * Every key runs from its smallest end in the bare address.
 */
function presentation(view: CommonFilesView, locale: Locale): Presentation<FileSortKey> {
  const names = messagesFor(locale).admin.contents.files.sortKeys
  return {
    sort: {
      keys: FILE_SORT_KEYS,
      current: view.sort,
      order: view.order,
      unwritten: FILE_SORT,
      runs: () => "asc",
      name: (key) => names[key],
    },
    size: view.size,
  }
}

/** The count and the pagination, over the table and again under it. */
function paging(view: CommonFilesView): ListingPaging {
  return {
    total: view.total,
    from: view.rangeFrom,
    to: view.rangeTo,
    page: view.page,
    pageCount: view.pageCount,
    at: (page) => at(view, { page }),
  }
}

/**
 * One file.
 *
 * **The slug is the row**: it is the address readers hold, minus the part every
 * file here shares. The whole address is what a body needs, so it is on the
 * button that copies rather than in a column that repeats the slug with a
 * prefix in front of it. **It is also the link to the file itself** — this prefix
 * is public from the moment something is put in it, so the address always
 * answers, and letting the browser decide what to do with what comes back is
 * the only answer that fits a prefix holding documents and spreadsheets alike.
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
            {/* Everything shown in a row is the row's size, not the
                page's. */}
            {/* **Moving the address is the break deleting it makes.** The
                object does not move within the bucket: the file is copied to
                the new key and the old one is deleted, and the trail writes it
                as exactly that. So the trigger uses the same style as the link to
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
            <input type="hidden" name="name" value={row.name} />
            <Confirm
              label={t.removeFile}
              title={t.removeFileTitle(row.name)}
              warning={t.removeFileWarning}
              confirm={t.removeFileConfirm}
              intent="delete"
              size="row"
            />
          </Form>
        </span>
      </Td>
    </tr>
  )
}
