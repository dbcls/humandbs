import { Card, Page, PageHead } from "~/components/page"
import { Markdown } from "~/components/markdown"
import { ActionButton, ActionRow, Notes } from "~/components/site"
import { messagesFor } from "~/i18n/messages"
import { renderMarkdown } from "~/public/markdown.server"
import { readLocale } from "~/public/urls"

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
    notes: [renderMarkdown(messages.account), renderMarkdown(messages.procedure)],
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: `${messages.submission.heading} - ${messages.siteName}` }]
}

export default function DataSubmission({ loaderData }: Route.ComponentProps) {
  const messages = messagesFor(loaderData.locale).submission

  return (
    <Page>
      <PageHead label={messages.heading} />
      <Card>
        <ActionRow>
          <ActionButton
            href="https://bsi.nig.ac.jp/submit"
            label={messages.navigator}
            note={messages.navigatorFor}
          />
          <ActionButton
            href="https://humandbs.ddbj.nig.ac.jp/nbdc/application/"
            label={messages.apply}
            note={messages.applyFor}
          />
        </ActionRow>
        <Notes>
          {loaderData.notes.map((html, index) => <Markdown key={index} html={html} />)}
        </Notes>
      </Card>
    </Page>
  )
}
