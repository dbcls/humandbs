import { Form } from "react-router"

import { newsAction, newsPage } from "~/admin/contents.server"
import { adminNewsListPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Confirm, Stack } from "~/components/base"
import { LocaleEditors, ResultLine } from "~/components/contents"
import { Field, Submit } from "~/components/form"
import { Card, Page, PageHead, Section } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents-news-item"

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

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const words = messages.admin.contents
  // Named by the announcement, not by the screen: every item shared one title,
  // so a window holding two of them said the same thing twice.
  const label = titleOf(loaderData.editors) ?? loaderData.publishedAt ?? words.news.undated
  return [
    { title: `${label} - ${words.news.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

/** The first language that has been given a title. */
function titleOf(editors: { draftTitle: string }[]): string | null {
  return editors.map((editor) => editor.draftTitle).find((one) => one !== "") ?? null
}

export default function AdminContentsNewsItem({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, publishedAt, editors } = loaderData
  const t = messagesFor(locale).admin.contents
  // What this announcement is called, in whichever language has been written.
  // An item with neither is one somebody has just created, and its date is the
  // only thing naming it.
  const title = titleOf(editors) ?? publishedAt ?? t.news.undated

  return (
    <Page>
      <PageHead kicker={t.news.heading} label={title}>
        <AdminBack onBand to={href(locale, adminNewsListPath())} label={t.news.backToList} />
      </PageHead>
      <Card>
        <Stack gap="block">
          <ResultLine result={actionData} locale={locale} />

          <Section title={t.news.publishedAt}>
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <Field
                label={t.news.publishedAt}
                name="publishedAt"
                type="date"
                value={publishedAt ?? ""}
              />
              <Submit intent="set-date">{t.save}</Submit>
            </Form>
          </Section>

          <LocaleEditors editors={editors} locale={locale} />

          <Section title={t.removeHeading}>
            <Form method="post">
              <Confirm
                label={t.news.remove}
                warning={t.removeNote}
                confirm={t.news.removeConfirm}
                cancel={t.cancel}
              >
                <input type="hidden" name="intent" value="delete-news" />
              </Confirm>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
