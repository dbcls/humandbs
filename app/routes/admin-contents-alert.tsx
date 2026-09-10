import { Form } from "react-router"

import { alertAction, alertsPage, type AlertRow } from "~/admin/contents.server"
import { Confirm, Heading, Stack } from "~/components/base"
import { ResultLine } from "~/components/contents"
import { Checkbox, Submit, TextArea } from "~/components/form"
import { Card, Empty, Page } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import type { Route } from "./+types/admin-contents-alert"

/**
 * The banner: the strip that stands above every public page.
 *
 * **It is not an article and does not share their screen.** An article is a
 * body at an address readers hold, kept in versions and published one language
 * at a time; the banner is a sentence the site says everywhere until somebody
 * takes it down. Written on one screen, the two ranked as siblings and the
 * banner read as one more entry in a tree of pages.
 *
 * **Standing on every page is what makes both languages compulsory**, which is
 * the one rule this screen enforces rather than the model: saving half of it is
 * how it gets written, but showing half of it hands a reader of the other
 * language an empty box (docs/editing.md の「サイトコンテンツ」).
 */
export async function loader({ request }: Route.LoaderArgs) {
  return alertsPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return alertAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.contents.alert.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsAlert({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, alerts } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.alert.heading} note={t.alert.note} />
          <ResultLine result={actionData} locale={locale} />

          {alerts.length === 0
            ? <Empty>{t.alert.none}</Empty>
            : (
                <Stack gap="normal">
                  {alerts.map((row) => <AlertForm key={row.id} row={row} locale={locale} />)}
                </Stack>
              )}

          <Form method="post">
            <Submit intent="create-alert">{t.alert.add}</Submit>
          </Form>
        </Stack>
      </Card>
    </Page>
  )
}

function AlertForm({ row, locale }: { row: AlertRow, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  return (
    <div className="flex flex-col gap-2 border-line border-b pb-4">
      <Form method="post" className="flex flex-col gap-2">
        <input type="hidden" name="alertId" value={row.id} />
        <TextArea label={t.languages.ja} name="ja" value={row.ja} rows={2} />
        <TextArea label={t.languages.en} name="en" value={row.en} rows={2} />
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox label={t.alert.active} name="active" checked={row.active} />
          <Submit intent="update-alert">{t.save}</Submit>
        </div>
      </Form>
      {/*
        Taking a banner away asks twice, the way every other removal on this
        area does — and in a form of its own, because an intent written as a
        hidden field cannot share one with buttons that name their own.
      */}
      <Form method="post">
        <input type="hidden" name="alertId" value={row.id} />
        <Confirm
          label={t.remove}
          warning={t.alert.removeWarning}
          confirm={t.alert.removeConfirm}
          cancel={t.cancel}
        >
          <input type="hidden" name="intent" value="delete-alert" />
        </Confirm>
      </Form>
    </div>
  )
}
