import { Heading } from "~/components/base"
import { Card, Crumbs, Page } from "~/components/page"
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
  const messages = messagesFor(loaderData.locale).contact

  return (
    <Page width="reading">
      <Crumbs locale={loaderData.locale} current={messages.heading} />
      <Card under={false}>
        <Heading title={messages.heading} />
        {/*
          **The form is on the page, the way it is on the current portal.** This
          is the most-used way in, and a page whose whole content is a link to
          somewhere else is a worse answer than embedding the thing being linked
          to. The sentence under it is the way through for anybody whose browser
          will not run the frame.
        */}
        <iframe
          src={messages.embed}
          title={messages.heading}
          loading="lazy"
          // Tall enough for the whole form: it scrolls inside itself
          // otherwise, and a form in a letterbox is worse than no embed.
          className="mt-4 h-[2000px] w-full border-0"
        />
        <div className="mt-2 text-sm">
          <Markdown html={loaderData.html} />
        </div>
      </Card>
    </Page>
  )
}
