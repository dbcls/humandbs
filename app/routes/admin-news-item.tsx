import { Form } from "react-router"

import { newsAction, newsPage } from "~/admin/contents.server"
import { adminNewsListPath } from "~/admin/urls"
import { Confirm, Stack } from "~/components/base"
import { contentsSaid, PublicPageButtons, useArticlePanes } from "~/components/contents"
import { DraftHead } from "~/components/draft-tools"
import { Answer, Editing, Field, Submit, Unsaved } from "~/components/form"
import { Icon } from "~/components/icons"
import { Page, Section } from "~/components/page"
import { asLocalInput, dayOf, minuteOf } from "~/dates"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { href, newsItemPath } from "~/public/urls"

import type { Route } from "./+types/admin-news-item"

/**
 * One announcement: the day it is dated, and each language's body and published
 * state.
 *
 * **The date belongs to the item rather than to a language**, and it is what
 * the public listing sorts by, so it is the announcement's own date rather than
 * a record of when a button was pressed.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const view = await newsPage(request, params.newsId)
  if (view === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  return view
}

export async function action({ request, params }: Route.ActionArgs) {
  return newsAction(request, params.newsId)
}

/**
 * **The window's name shows which announcement this is, and the screen does
 * not.** On the screen the title is already there, in the box it is typed into,
 * so a copy of it beside the heading is the same words twice — and one that
 * moves as the reader types. A window has nothing else: two announcements open
 * at once are told apart by their names or by nothing at all.
 *
 * Which announcement, in whichever language has been written: an item with
 * neither is named by its date, and one with no date either by the word for
 * that.
 */
/** The first language that has been given a title. */
function titleOf(editors: { title: string }[]): string | null {
  return editors.map((editor) => editor.title).find((one) => one !== "") ?? null
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const words = messages.admin.contents
  const dated = loaderData.publishedAt === null ? null : minuteOf(loaderData.publishedAt)
  const label = titleOf(loaderData.editors) ?? dated ?? words.news.undated
  return [
    { title: adminWindowTitle(messages, location.pathname, words.news.itemHeading, label) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsNewsItem({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, id, publishedAt, scheduled, editors } = loaderData
  const t = messagesFor(locale).admin.contents
  const save = messagesFor(locale).admin.editor.save

  /*
    **The date is the announcement's rather than a language's**, so it is
    in the header with the name rather than in a language's form, and the page
    beside the form shows the day under the title the way the public page does.

    **The clock in the box is the one the announcement goes out on** (JST), and
    a reader with no way to check which zone that is would have to guess from
    the value — which reads the same either way. **What the date does is said
    once, under the section's name**: that it is the date readers see, that a
    language goes out only once it has come, and that a date ahead is how an
    announcement is scheduled. Waiting itself is said by each language's state
    (「公開予定」), since it is each published language that waits.
  */
  const dating = (
    <Section title={t.news.publishedAt} note={t.news.publishedAtNote}>
      <Stack gap="tight">
        <Editing method="post" className="flex flex-wrap items-end gap-2">
          <Field
            label={t.news.publishedAtField}
            name="publishedAt"
            type="datetime-local"
            width="w-56"
            value={publishedAt === null ? "" : asLocalInput(publishedAt)}
          />
          <span className="flex items-center gap-2">
            <Submit intent="set-date" icon={<Icon name="save" />} saves>{save}</Submit>
            <Unsaved locale={locale} />
          </span>
        </Editing>
      </Stack>
    </Section>
  )
  const closedReason = (language: Locale): string | null => {
    if (editors.find((editor) => editor.locale === language)?.published !== true) return t.publicPageUnpublished
    return scheduled ? t.publicPageScheduled : null
  }
  const panes = useArticlePanes({
    locale,
    remember: `news:${id}`,
    editors,
    result: actionData,
    // A language is on the public side once it is published and its date has come.
    publicPages: (
      <PublicPageButtons
        locale={locale}
        path={newsItemPath(id)}
        closed={{ ja: closedReason("ja"), en: closedReason("en") }}
      />
    ),
    dated: publishedAt === null ? null : dayOf(publishedAt),
    publishing: { dated: publishedAt !== null, ahead: scheduled },
  })

  return (
    <Page>
      <Answer answer={actionData} locale={locale} said={(answer) => contentsSaid(answer, locale)} />
      <Stack>
        {/* **The header is left for the announcement, and collapses to its tools
            row while typing** (`draft-tools.tsx` の `DraftHead`). Its second
            line has the publish date — the one thing here that belongs
            to the announcement rather than to a language. */}
        <DraftHead
          locale={locale}
          title={t.news.itemHeading}
          updating={null}
          back={{ to: href(locale, adminNewsListPath()), label: t.news.backToList, icon: "chevron-left" }}
          headExtra={(
            <>
              {/* **What takes the whole announcement away is shown beside its
                  name**, next to the back link, rather than among the languages:
                  an announcement is made before anything is written into it,
                  and a control placed on the last written language is out
                  of reach exactly when there is nothing to keep. */}
              <Form method="post">
                <Confirm
                  label={t.news.remove}
                  title={t.news.removeTitle}
                  warning={t.news.removeWarning}
                  confirm={t.news.removeConfirm}
                  intent="delete-news"
                />
              </Form>
            </>
          )}
          overview={dating}
          tools={panes.tools}
        />
        {panes.view}
      </Stack>
    </Page>
  )
}
