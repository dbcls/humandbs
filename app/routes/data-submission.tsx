import { Heading, Stack } from "~/components/base"
import { Card, Crumbs, Page } from "~/components/page"
import { Markdown } from "~/components/markdown"
import { ActionButton, ActionRow } from "~/components/site"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { renderMarkdown } from "~/public/markdown.server"
import { applicationUrl, readLocale } from "~/public/urls"

import type { Route } from "./+types/data-submission"

/**
 * Where a provider starts. This is a screen — two ways in and two sentences —
 * rather than a document, so it is not editable through the CMS. Its sentences
 * carry links, so they are held as markdown in the dictionary and rendered
 * here, which keeps a sentence one string instead of three fragments around a
 * link.
 */
export function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const messages = messagesFor(locale).submission
  return {
    locale,
    notes: [renderMarkdown(messages.account, locale), renderMarkdown(messages.procedure, locale)],
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: windowTitle(messages, [messages.submission.heading]) }]
}

export default function DataSubmission({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData
  const messages = messagesFor(locale).submission

  return (
    <Page width="reading">
      <Crumbs locale={loaderData.locale} current={messages.heading} />
      <Card under={false}>
        <Stack gap="block">
          <Heading title={messages.heading} />
          <ActionRow>
            <ActionButton
              locale={locale}
              href="https://bsi.nig.ac.jp/submit"
              label={messages.navigator}
              note={messages.navigatorFor}
              tone="accent"
              icon="upload"
            />
            <ActionButton
              locale={locale}
              href={applicationUrl(locale)}
              label={messages.apply}
              note={messages.applyFor}
              tone="accent"
              icon="edit"
            />
          </ActionRow>
          <Stack gap="normal">
            {loaderData.notes.map((html, index) => <Markdown key={index} html={html} />)}
          </Stack>
        </Stack>
      </Card>
    </Page>
  )
}
