import { Link } from "react-router"

import { adminDestinations, type AdminDestination } from "~/admin/navigation"
import { adminPath } from "~/admin/urls"
import { requireActor } from "~/auth/actor.server"
import { Heading, Note, Stack } from "~/components/base"
import { Card, Empty, KeyValue, Page, Section, Table, Td } from "~/components/page"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"
import { upstreamStatus } from "~/upstream/status.server"

import type { Route } from "./+types/admin"

/**
 * The way into the management area.
 *
 * **It is the map, and the map has no heading.** The page's own name says what
 * this is, so a section called 「行き先」 beneath it would be the screen saying
 * its name twice. Nothing is indented either — every entry is reachable without
 * knowing an identity, so drawing a hierarchy would claim that a parent has to
 * be opened first (`admin/navigation.ts`). The nineteen screens are reached
 * from here; the twelve about one research, one draft, one document or one
 * field are reached by choosing that thing.
 *
 * **It asks for a session but not for a capability, and what it holds depends
 * on which.** An administrator gets the map. Somebody holding no capability
 * gets their own `sub` instead — that is what makes the first administrator
 * possible: access is granted by `sub`, nothing else displays one, and somebody
 * has to be able to read theirs before anybody can be granted anything.
 * **An administrator is not shown one**: they are already in, their name is in
 * the account menu, and an administrator holds every capability — so both lists
 * read the same for every administrator there will ever be.
 *
 * **How the fetches from outside are going is here too**, for readers who may
 * see unpublished state. A failed fetch deliberately leaves the previous values
 * in place, so without a screen a refresh that stopped a week ago looks exactly
 * like one that ran this morning (docs/editing.md の「管理画面」).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireActor(request)
  const holdsNothing = actor.capabilities.size === 0
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    // Only somebody who cannot do anything yet is told their own identifier.
    sub: holdsNothing ? actor.sub : null,
    upstream: actor.capabilities.has("view-unpublished") ? await upstreamStatus(getDb()) : null,
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
  const { locale, sub, upstream } = loaderData
  const messages = messagesFor(locale)
  const words = messages.admin.caches

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={messages.admin.heading} />

          {sub === null
            ? (
                <Stack gap="tight">
                  <Stack as="ul" gap="tight">
                    {mapOf(locale).map((entry) => (
                      <li key={entry.path}>
                        <Link to={href(locale, entry.path)}>{entry.label}</Link>
                      </li>
                    ))}
                  </Stack>
                  <Empty>{messages.admin.map.note}</Empty>
                </Stack>
              )
            : (
                <Stack gap="tight">
                  <Note kind="warning">{messages.admin.notAdmin}</Note>
                  <dl>
                    <KeyValue title={messages.admin.subject}>
                      <code className="text-sm">{sub}</code>
                    </KeyValue>
                  </dl>
                  <Empty>{messages.admin.subjectNote}</Empty>
                </Stack>
              )}

          {upstream !== null && (
            <Section title={words.heading}>
              <Stack gap="tight">
                <Table headers={[words.source, words.lastSuccess, words.rows, words.state]}>
                  {upstream.map((row) => (
                    <tr key={row.source}>
                      <Td>{words.sources[row.source]}</Td>
                      <Td nowrap>{row.succeededAt?.slice(0, 10) ?? "—"}</Td>
                      <Td nowrap>{row.rowCount ?? "—"}</Td>
                      <Td>
                        {row.failure ?? (row.succeededAt === null ? words.never : words.ok)}
                      </Td>
                    </tr>
                  ))}
                </Table>
                <Empty>{words.note}</Empty>
              </Stack>
            </Section>
          )}
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * The destinations, flat, without the one the reader is standing on.
 *
 * **The tree in `navigation.ts` is the tab's shape, not this one's.** What
 * hangs under an area there is reachable by an address anybody can type, so
 * indenting it here would say that the area has to be opened first.
 */
function mapOf(locale: Locale): AdminDestination[] {
  return adminDestinations(locale)
    .filter((entry) => entry.path !== adminPath())
    .flatMap((entry) => [entry, ...entry.under ?? []])
}
