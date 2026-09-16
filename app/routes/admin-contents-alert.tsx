import { Fragment, useState } from "react"
import { Form } from "react-router"

import { alertAction, alertsPage, type AlertRow } from "~/admin/contents.server"
import { Badge, Confirm, Heading, Stack } from "~/components/base"
import { ResultLine } from "~/components/contents"
import { Answered, Editing, Submit, TextArea, Unsaved } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Empty, Page } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"

import type { Route } from "./+types/admin-contents-alert"

/**
 * The alert: the sentence the site says at the top of every public page.
 *
 * **It is not an article and does not share their screen.** An article is a
 * body at an address readers hold, kept in versions and published one language
 * at a time; the alert is a sentence the site says everywhere until somebody
 * takes it down. Written on one screen, the two ranked as siblings and the
 * alert read as one more entry in a tree of pages.
 *
 * **Standing on every page is what makes both languages compulsory**, which is
 * the one rule this screen enforces rather than the model: saving half of it is
 * how it gets written, but showing half of it hands a reader of the other
 * language an empty box.
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
    { title: pageTitle(messages, messages.admin.contents.alert.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsAlert({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, alerts } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          {/* The way to make one stands on the heading's own line: it acts on
              the screen rather than on any one alert, and at the foot it moves
              further down the page with every alert added. */}
          <Heading title={t.alert.heading} note={t.alert.note}>
            <Form method="post">
              <Submit intent="create-alert" icon={<Icon name="plus" />}>{t.alert.add}</Submit>
            </Form>
          </Heading>

          {alerts.length === 0
            ? <Empty>{t.alert.none}</Empty>
            : (
                <Stack gap="normal">
                  {/* A line between two alerts and nowhere else: one under the
                      last marks the end of nothing, and reads as the top edge
                      of whatever the screen puts next. */}
                  {alerts.map((row, index) => (
                    <Fragment key={row.id}>
                      {index > 0 && <hr className="border-line" />}
                      <AlertForm row={row} locale={locale} />
                    </Fragment>
                  ))}
                </Stack>
              )}
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * The width the control that shows and hides is held at.
 *
 * **The word changes with the state and the width may not.** 「表示する」 and
 * 「非表示にする」 are two and four characters apart, so a control drawn to fit
 * moves the save beside it every time it is pressed — and the row is the one
 * place on the screen the reader presses twice in a row.
 */
const SHOWING = "min-w-36"

/** What is typed into one of the two boxes, with the spaces around it dropped. */
function bodyOf(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name)
  return field instanceof HTMLTextAreaElement ? field.value.trim() : ""
}

/**
 * One alert, and everything that can be done to it.
 *
 * **Showing it is a button rather than a box to tick.** An alert is either up
 * or it is not; a tick that takes effect at the next save leaves the screen
 * saying one thing while the site says another. The button carries the state in
 * its word — what it offers is the other one — and pressing it saves what has
 * been typed, so there is no way to put up a sentence that is not the one on
 * the screen.
 *
 * **Both languages are the condition for showing it, so the button holds that
 * condition.** The server refuses an alert with an empty side, and a control
 * that can be pressed into a refusal is one the reader only hears about
 * afterwards.
 *
 * **One form rather than three.** Every button names its own intent, so what
 * has been typed travels with whichever of them is pressed.
 */
function AlertForm({ row, locale }: { row: AlertRow, locale: Locale }) {
  const messages = messagesFor(locale)
  const t = messages.admin.contents
  const [ready, setReady] = useState(row.ja !== "" && row.en !== "")

  return (
    <Editing
      method="post"
      className="flex flex-col gap-2"
      onInput={(event) => {
        const form = event.currentTarget
        setReady(bodyOf(form, "ja") !== "" && bodyOf(form, "en") !== "")
      }}
    >
      <input type="hidden" name="alertId" value={row.id} />
      {/* Which of these the site is saying, above the words rather than in the
          state of a control at the foot of them. */}
      <p>
        {row.active
          ? <Badge tone="accent" icon={<Icon name="eye" />}>{t.alert.shown}</Badge>
          : <Badge tone="muted" icon={<Icon name="eye-off" />}>{t.alert.hidden}</Badge>}
      </p>
      <TextArea
        label={t.languages.ja}
        name="ja"
        value={row.ja}
        accepts={messages.admin.accepts.markdown}
        rows={2}
      />
      <TextArea
        label={t.languages.en}
        name="en"
        value={row.en}
        accepts={messages.admin.accepts.markdown}
        rows={2}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-3">
          {row.active
            ? (
                <Submit intent="hide-alert" icon={<Icon name="eye-off" />} className={SHOWING}>
                  {t.alert.hide}
                </Submit>
              )
            : (
                <Submit
                  intent="show-alert"
                  icon={<Icon name="eye" />}
                  className={SHOWING}
                  disabled={!ready}
                >
                  {t.alert.show}
                </Submit>
              )}
          <Submit intent="update-alert" icon={<Icon name="save" />} saves>{t.alert.save}</Submit>
          <Unsaved locale={locale} />
          {!row.active && !ready && (
            <span className="text-ink-muted text-xs">{t.alert.showBlocked}</span>
          )}
        </span>
        <Confirm
          label={t.alert.remove}
          title={t.alert.removeTitle}
          warning={t.alert.removeWarning}
          confirm={t.alert.removeConfirm}
          cancel={t.cancel}
          intent="delete-alert"
        />
      </div>
    </Editing>
  )
}
