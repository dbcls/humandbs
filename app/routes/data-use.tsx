import { Heading, Stack } from "~/components/base"
import { Card, Crumbs, Page } from "~/components/page"
import { Markdown } from "~/components/markdown"
import { ActionButton, ActionRow } from "~/components/site"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { renderMarkdown } from "~/public/markdown.server"
import { applicationUrl, href, readLocale } from "~/public/urls"

import type { Route } from "./+types/data-use"

/**
 * Where a user starts. The first link is to the portal's own research list, so
 * it is an internal address rather than the absolute one the CMS page kept —
 * that link named the production host, which sent readers of any other
 * deployment to production.
 */
export function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const messages = messagesFor(locale).use
  return {
    locale,
    notes: [renderMarkdown(messages.account, locale), renderMarkdown(messages.procedure, locale)],
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: windowTitle(messages, [messages.use.heading]) }]
}

export default function DataUse({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData
  const messages = messagesFor(locale).use

  return (
    <Page width="reading">
      <Crumbs locale={locale} current={messages.heading} />
      <Card under={false}>
        <Stack gap="block">
          <Heading title={messages.heading} />
          <ActionRow>
            <ActionButton
              locale={locale}
              href={href(locale, "/research")}
              label={messages.find}
              note={messages.findFor}
              tone="brand"
              icon="search"
              external={false}
            />
            <ActionButton
              locale={locale}
              href={applicationUrl(locale)}
              label={messages.apply}
              note={messages.applyFor}
              tone="brand"
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
