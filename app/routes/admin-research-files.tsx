import { data, Link } from "react-router"

import {
  adminResearchFilesPath,
  adminResearchPath,
  fileUploadPath,
} from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import {
  Chooser,
  CHOOSER_SIDE,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Note,
  Stack,
} from "~/components/base"
import { BoxTable, UploadPanel } from "~/components/files"
import { Answered, Result } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Paging, Section } from "~/components/page"
import { BOX_SORT, BOX_SORT_KEYS, type BoxSortKey, formatSize } from "~/files/box"
import { filesAction, filesPage } from "~/files/pages.server"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-research-files"

/**
 * The research's box.
 *
 * **It is not under a draft.** The box belongs to the research, holds no
 * versions, and making a file public is a separate operation from publishing a
 * version — putting it inside a draft would say the two happen together
 * (docs/files.md の「画面」).
 *
 * Switching is queued rather than done: a copy across buckets moves the actual
 * bytes, and the largest file here is measured in hundreds of gigabytes. The
 * screen says what is in flight and does not wait for it.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return filesPage(request, locale, params.researchId)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await filesAction(request, locale, params.researchId)
  return result instanceof Response ? result : data(result, { status: 400 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.files.heading, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchFiles({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.files

  const at = (over: { sort?: BoxSortKey, order?: "asc" | "desc", page?: number }): string => {
    const next = { sort: view.sort, order: view.order, page: 1, ...over }
    const search = new URLSearchParams()
    if (next.sort !== BOX_SORT) search.set("sort", next.sort)
    if (next.order !== "asc") search.set("order", next.order)
    if (next.page !== 1) search.set("page", String(next.page))
    const written = search.toString()
    return href(
      locale,
      adminResearchFilesPath(view.researchId) + (written === "" ? "" : `?${written}`),
    )
  }

  // The box names its own columns, so the orders are named by them rather than
  // by a second set of words meaning the same three things.
  const sortNames: Record<BoxSortKey, string> = {
    slug: t.name,
    size: t.size,
    updated: t.updatedAt,
  }
  const flipped = view.order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending

  /*
    How the box is read, and which part of it is on screen.

    **It stands above the table and again below it.** A page of rows is longer
    than the window, so a reader who has decided against this page would
    otherwise have to climb back over it to reach the next one. Listings with a
    pane get the same repetition from `RefinableList`; this box has no pane, so
    it places the row itself.
  */
  const paging = (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
      <Chooser
        label={messages.search.sort.label}
        value={sortNames[view.sort]}
        beside={(
          <Link
            to={at({ order: flipped })}
            aria-label={turn}
            title={turn}
            className={CHOOSER_SIDE}
          >
            {/* The glyph says which way the box runs now, not where it goes. */}
            <Icon name={view.order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
          </Link>
        )}
      >
        {BOX_SORT_KEYS.map((option) => (
          <Link
            key={option}
            to={at({ sort: option, order: "asc" })}
            aria-current={option === view.sort ? "true" : undefined}
            className={option === view.sort ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {sortNames[option]}
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

  return (
    <Page>
      {/* Only a refusal is answered: publishing, taking down and deleting all
          come back as the box they changed. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "nothing-selected" && <Result ok={false}>{t.nothingSelected}</Result>}
        {actionData?.status === "no-box" && <Result ok={false}>{t.publishNeedsLabel}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminResearchPath(view.researchId))}
              label={t.backToResearch}
              icon="chevron-left"
            />
          </Heading>

          {/* Not an answer but a standing fact about this research: it stays on
              the screen (`docs/ui.md` の「管理画面の枠」). */}
          {view.humLabel === null && <Note kind="warning">{t.noBox}</Note>}

          <Section title={t.upload}>
            <UploadPanel
              locale={locale}
              endpoint={fileUploadPath(view.researchId)}
              threshold={view.multipartThreshold}
              partSize={view.partSize}
              hint={t.uploadHint}
            />
          </Section>

          <Section title={t.heading}>
            {view.rows === null
              ? <Note kind="danger">{t.unavailable}</Note>
              : (
                  <Stack gap="normal">
                    {/* What the box holds altogether, which the count beside the
                        page links does not say: a hundred rows of a thousand is
                        not how much storage this research is using. */}
                    <p className="text-ink-muted text-sm">{t.totalSize(formatSize(view.totalBytes))}</p>
                    {view.switching > 0 && (
                      <p className="text-accent text-sm">{t.switching(view.switching)}</p>
                    )}
                    {paging}
                    <BoxTable locale={locale} rows={view.rows} humLabel={view.humLabel} />
                    {paging}
                  </Stack>
                )}
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
