import { data, Form, Link } from "react-router"

import { adminContentFilesPath, contentFileUploadPath } from "~/admin/urls"
import {
  Button,
  Chooser,
  CHOOSER_SIDE,
  Confirm,
  Dialog,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Note,
  Stack,
} from "~/components/base"
import { CopyAddress, UploadPanel } from "~/components/files"
import { Answered, Field, Result, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Paging, Table, Td } from "~/components/page"
import { BOX_SORT, BOX_SORT_KEYS, formatSize, type BoxSortKey, type StoredNode } from "~/files/box"
import {
  commonFilesAction,
  commonFilesPage,
  type CommonFilesView,
  type FilesActionResult,
} from "~/files/pages.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { PAGE_SIZE, PAGE_SIZES, type PageSize } from "~/search/page-size"
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
 * **The screen is the way in and the box, and nothing between them.** A heading
 * over a single upload panel and a second over the one table name what is
 * already the only thing there.
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

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.contents.files.heading) },
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

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        {actionData !== undefined && <Result ok={false}>{refusal(actionData, locale)}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} />

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
                <Stack gap="normal">
                  <Tools view={view} locale={locale} />
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
                    whenEmpty={t.none}
                  >
                    {view.rows.map((row) => (
                      <Row key={row.name} row={row} locale={locale} />
                    ))}
                  </Table>
                  <div className="flex justify-end">
                    <Paging
                      locale={locale}
                      total={view.total}
                      from={view.rangeFrom}
                      to={view.rangeTo}
                      page={view.page}
                      pageCount={view.pageCount}
                      at={(page) => at(view, { page })}
                    />
                  </div>
                </Stack>
              )}
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * This listing under a different setting.
 *
 * **What is at its default is left out of the address.** A reader who asked for
 * nothing is reading a bare address, and the link they copy out of the bar
 * carries no setting they never chose.
 *
 * **Changing anything but the page goes back to the first one.** Page 7 of an
 * ordering nobody has seen yet is not where anyone meant to land.
 */
function at(view: CommonFilesView, over: {
  sort?: BoxSortKey
  order?: "asc" | "desc"
  size?: PageSize
  page?: number
}): string {
  const next = { sort: view.sort, order: view.order, size: view.size, page: 1, ...over }
  const search = new URLSearchParams()
  if (next.sort !== BOX_SORT) search.set("sort", next.sort)
  if (next.order !== "asc") search.set("order", next.order)
  if (next.size !== PAGE_SIZE) search.set("size", String(next.size))
  if (next.page !== 1) search.set("page", String(next.page))
  const written = search.toString()
  return href(view.locale, adminContentFilesPath() + (written === "" ? "" : `?${written}`))
}

/**
 * How the box is read: in what order, and how much of it at a time.
 *
 * **The same pair the research listing carries**, in the same place and the
 * same shape — a box of files and a list of research are both listings, and a
 * reader who learned the controls on one should not have to find them again.
 */
function Tools({ view, locale }: { view: CommonFilesView, locale: Locale }) {
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
            to={at(view, { order: flipped })}
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
            to={at(view, { sort: option, order: "asc" })}
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
            to={at(view, { size: option })}
            aria-current={option === view.size ? "true" : undefined}
            className={option === view.size ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {option}
          </Link>
        ))}
      </Chooser>
    </div>
  )
}

/**
 * One file.
 *
 * **The slug is the row**: it is the address readers hold, minus the part every
 * file here shares. The whole address is what a body needs, so it is on the
 * button that copies rather than in a column that repeats the slug with a
 * prefix in front of it.
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
      <Td><code className="text-xs">{row.name}</code></Td>
      <Td nowrap>{formatSize(row.size)}</Td>
      <Td nowrap>{row.updatedAt.slice(0, 10)}</Td>
      <Td nowrap holds="control">
        <span className="flex items-center gap-1">
          <CopyAddress address={address} locale={locale} />
          <Form method="post">
            <input type="hidden" name="intent" value="rename" />
            <input type="hidden" name="from" value={row.name} />
            {/* Everything standing in a row is the row's size, not the
                page's (`docs/ui.md` の「押せるものの大きさ」). */}
            <Dialog
              label={t.rename}
              title={t.renameTitle}
              icon={<Icon name="edit" />}
              size="row"
            >
              {(close) => (
                <Stack gap="normal">
                  <Field
                    label={t.slug}
                    name="to"
                    value={row.name}
                    width="w-full"
                    hint={t.renameHint}
                  />
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={close}>
                      {messages.admin.contents.cancel}
                    </Button>
                    <Submit icon={<Icon name="save" />}>{t.renameConfirm}</Submit>
                  </span>
                </Stack>
              )}
            </Dialog>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="name" value={row.name} />
            <Confirm
              label={t.removeFile}
              title={t.removeFileTitle}
              warning={t.removeConfirm}
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
