import { Card, Page, PageHead } from "~/components/page"
import { Markdown } from "~/components/markdown"
import { messagesFor } from "~/i18n/messages"
import { renderMarkdown } from "~/public/markdown.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/contact-us"

/**
 * A link to the form the office runs, not the form itself. v1 embedded Google
 * Forms in an iframe, which is the whole of what that page contained — keeping
 * it would mean letting a document decide what the portal frames on its own
 * origin, for one page that has no prose at all.
 */
export function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return { locale, html: renderMarkdown(messagesFor(locale).contact.form) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: `${messages.contact.heading} - ${messages.siteName}` }]
}

export default function ContactUs({ loaderData }: Route.ComponentProps) {
  return (
    <Page>
      <PageHead label={messagesFor(loaderData.locale).contact.heading} />
      <Card>
        <Markdown html={loaderData.html} />
      </Card>
    </Page>
  )
}
