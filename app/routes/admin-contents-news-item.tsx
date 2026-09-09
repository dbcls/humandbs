import { Form, Link } from "react-router"

import { newsAction, newsPage } from "~/admin/contents.server"
import { adminNewsListPath } from "~/admin/urls"
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
  return [
    { title: `${messages.admin.contents.news.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsNewsItem({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, publishedAt, editors } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <PageHead label={t.news.heading}>
        <Link to={href(locale, adminNewsListPath())} className="text-white">{t.news.backToList}</Link>
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
