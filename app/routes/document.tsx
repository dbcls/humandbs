import { redirect } from "react-router"

import { Heading, Stack } from "~/components/base"
import { Card, Crumbs, Page } from "~/components/page"
import { Markdown } from "~/components/markdown"
import { messagesFor } from "~/i18n/messages"
import { documentPage } from "~/public/site.server"
import { href, legacyTarget, readLocale } from "~/public/urls"

import type { Route } from "./+types/document"

/**
 * Everything the named routes did not take: a document, or an address that
 * resolves to one of them.
 *
 * The order matters. A bare hum label is how DDBJ Search links to this site and
 * has to keep working forever, and the old Joomla addresses are written down in
 * places nobody can edit, so both are answered before anything is looked up. A
 * slug is only asked for once neither pattern matched, which also means a
 * document can never take an address a research page has a claim to.
 *
 * The redirects happen on the server: v1 issued them from the browser, which
 * never reached a client that does not run JavaScript.
 *
 * `/ja/…` lands here too, because Japanese has no prefix. It is the same page
 * as the unprefixed address and redirects to it, so one page keeps one address.
 *
 * **The address comes from the match, not from the request.** A client-side
 * navigation asks for `<path>.data`, and the suffix is taken off before the
 * route is matched but stays on `request.url`. Reading the URL here would look
 * up a slug ending in `.data` and answer 404 for every document on the site,
 * while an address opened directly kept working.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const { locale, path, redundantPrefix } = readLocale(`/${params["*"]}`)
  if (redundantPrefix) throw redirect(path)

  const target = legacyTarget(path)
  if (target !== null) throw redirect(href(locale, target))

  const slug = path.replace(/^\/+/, "").replace(/\/+$/, "")
  if (slug === "") throw new Response(null, { status: 404, statusText: "Not Found" })

  return { locale, article: await documentPage(slug, locale) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const { siteName } = messagesFor(loaderData.locale)
  return [{ title: `${loaderData.article.title} - ${siteName}` }]
}

export default function Document({ loaderData }: Route.ComponentProps) {
  return (
    <Page width="reading">
      <Crumbs locale={loaderData.locale} current={loaderData.article.title} />
      <Card under={false}>
        <Stack gap="normal">
          <Heading title={loaderData.article.title} />
          <Markdown html={loaderData.article.html} />
        </Stack>
      </Card>
    </Page>
  )
}
