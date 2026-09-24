import { Fragment, useState } from "react"
import { Form } from "react-router"

import { alertAction, alertsPage, type AlertRow } from "~/admin/contents.server"
import { Confirm, Heading, Stack } from "~/components/base"
import { contentsSaid, SHOWING } from "~/components/contents"
import { Answer, Editing, LanguagePair, Submit, TextArea, Unsaved } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Empty, Page } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"

import type { Route } from "./+types/admin-contents-alert"
import { Flag } from "~/components/flags"

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

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.contents.alert.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsAlert({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, alerts } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <Answer answer={actionData} locale={locale} said={(answer) => contentsSaid(answer, locale)} />
      {/* **This screen has no sections**, so the distance under the heading is
          the one between a heading and what it heads rather than between two
          parts. What comes next is the first alert itself, which opens with its
          own state rather than with a name. */}
      <Card under={false}>
        <Stack gap="normal">
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
 * afterwards. While a side is empty the button cannot be pressed and says why
 * over itself (`Button` の `disabled`); the two boxes wear the mark of a box
 * that has to be filled (`form.tsx` の `required`) — for the showing, not for
 * the save, which takes one language at a time.
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
      className="flex flex-col gap-4"
      onInput={(event) => {
        const form = event.currentTarget
        setReady(bodyOf(form, "ja") !== "" && bodyOf(form, "en") !== "")
      }}
    >
      <input type="hidden" name="alertId" value={row.id} />
      {/* Which of these the site is saying, above the words rather than in the
          state of a control at the foot of them — and at the other end of that
          line, the way to take the whole alert away. It acts on the alert
          rather than on what is typed into it, so it stands with what names
          the alert rather than among the controls that write it.

          **The day it went up stands beside the state**, the way an article's
          publish day stands beside its language's (`components/contents.tsx`
          の `LocaleEditors`): the state says that the site is saying this, and
          the day says since when. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-3 text-sm">
          {row.active
            ? <Flag kind="live">{t.alert.shown}</Flag>
            : <Flag kind="off">{t.alert.hidden}</Flag>}
          {row.shownAt !== null && (
            <span className="text-ink-muted text-xs">
              {t.alert.shownOn}
              {" "}
              {row.shownAt}
            </span>
          )}
        </p>
        <Confirm
          label={t.alert.remove}
          title={t.alert.removeTitle}
          warning={t.alert.removeWarning}
          confirm={t.alert.removeConfirm}
          intent="delete-alert"
        />
      </div>
      {/* **The two languages are one value.** */}
      <LanguagePair>
        <TextArea
          label={t.languages.ja}
          name="ja"
          value={row.ja}
          required={messages.admin.required}
          accepts={messages.admin.accepts.markdown}
          rows={2}
        />
        <TextArea
          label={t.languages.en}
          name="en"
          value={row.en}
          required={messages.admin.required}
          accepts={messages.admin.accepts.markdown}
          rows={2}
        />
      </LanguagePair>
      <div className="flex flex-wrap items-center gap-3">
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
                disabled={ready ? undefined : t.alert.showBlocked}
                reasonAt="left"
              >
                {t.alert.show}
              </Submit>
            )}
        <Submit intent="update-alert" icon={<Icon name="save" />} saves>{t.alert.save}</Submit>
        <Unsaved locale={locale} />
      </div>
    </Editing>
  )
}
