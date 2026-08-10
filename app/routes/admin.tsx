import { Link } from "react-router"

import { adminCatalogPath, adminResearchListPath } from "~/admin/urls"
import { requireActor } from "~/auth/actor.server"
import { Card, Empty, KeyValue, Page, PageHead } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin"

/**
 * The way into the management area. What it holds is the editing screens, which
 * come later and are each guarded by the capability they need; what it shows now
 * is who is signed in and what that person may do.
 *
 * **It asks for a session but not for a capability**, and it shows the reader
 * their own `sub`. That is what makes the first administrator possible: access is
 * granted by `sub`, nothing else displays one, and somebody has to be able to
 * read theirs before anybody can be granted anything. It discloses nothing but
 * the reader's own identity.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireActor(request)
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    sub: actor.sub,
    name: actor.name,
    capabilities: [...actor.capabilities],
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { locale, sub, name, capabilities } = loaderData
  const messages = messagesFor(locale)

  return (
    <Page>
      <PageHead label={messages.admin.heading}>
        {capabilities.includes("view-unpublished") && (
          <Link to={href(locale, adminResearchListPath())} className="text-white">
            {messages.admin.research.heading}
          </Link>
        )}
        {capabilities.includes("manage-catalog") && (
          <Link to={href(locale, adminCatalogPath())} className="text-white">
            {messages.admin.catalog.heading}
          </Link>
        )}
      </PageHead>
      <Card>
        <dl>
          <KeyValue title={messages.admin.signedInAs}>{name}</KeyValue>
          <KeyValue title={messages.admin.subject}>
            <code className="text-sm">{sub}</code>
          </KeyValue>
          <KeyValue title={messages.admin.capabilities}>
            {capabilities.length === 0
              ? <Empty>{messages.admin.notAdmin}</Empty>
              : (
                  <ul className="flex flex-wrap gap-2">
                    {capabilities.map((capability) => (
                      <li
                        key={capability}
                        className="rounded-sm border border-line px-2 py-0.5 text-ink-muted text-xs"
                      >
                        {capability}
                      </li>
                    ))}
                  </ul>
                )}
          </KeyValue>
        </dl>
      </Card>
    </Page>
  )
}
