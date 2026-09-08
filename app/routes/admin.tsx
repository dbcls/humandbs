import { Link } from "react-router"

import { adminDestinations, type AdminDestination } from "~/admin/navigation"
import { adminPath } from "~/admin/urls"
import { requireActor } from "~/auth/actor.server"
import { Badge, Heading, Stack } from "~/components/base"
import { Card, Crumbs, Empty, KeyValue, Page, Section, Table, Td } from "~/components/page"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"
import { upstreamStatus } from "~/upstream/status.server"

import type { Route } from "./+types/admin"

/**
 * The way into the management area.
 *
 * **It is the map.** The tab at the edge of the window lists the five areas,
 * which is as much as a 36px handle can hold; the nineteen screens are reached
 * from here, and the eleven that are about one research or one document are
 * reached by choosing that thing — so what stands here is the eight addresses
 * that need no identity, each saying what lies under it (`admin/navigation.ts`).
 *
 * **It asks for a session but not for a capability**, and it shows the reader
 * their own `sub`. That is what makes the first administrator possible: access
 * is granted by `sub`, nothing else displays one, and somebody has to be able
 * to read theirs before anybody can be granted anything. It discloses nothing
 * but the reader's own identity — and no map, because a list of doors that will
 * not open is not an answer to "why can I not do anything".
 *
 * **How the upstream fetches are going is here too**, for readers who may see
 * unpublished state. A failed fetch deliberately leaves the previous values in
 * place, so without a screen a refresh that stopped a week ago looks exactly
 * like one that ran this morning (docs/editing.md の「管理画面」).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireActor(request)
  const maySeeUpstream = actor.capabilities.has("view-unpublished")
  return {
    locale: readLocale(new URL(request.url).pathname).locale,
    sub: actor.sub,
    name: actor.name,
    capabilities: [...actor.capabilities],
    upstream: maySeeUpstream ? await upstreamStatus(getDb()) : null,
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
  const { locale, sub, name, capabilities, upstream } = loaderData
  const messages = messagesFor(locale)
  const words = messages.admin.caches
  const map = messages.admin.map

  return (
    <Page>
      {/* 区画の根なので、`AdminCrumbs` は使わない — あれは「管理」の段を足すもので、
          ここではそれが現在地そのものになる。 */}
      <Crumbs locale={locale} current={messages.admin.heading} />
      <Card under={false}>
        <Stack gap="block">
          <Heading title={messages.admin.heading} />

          {capabilities.length > 0 && (
            <Section title={map.heading}>
              <Stack gap="tight">
                <ul className="flex flex-col gap-3">
                  {adminDestinations(locale)
                    // The area's own front page is where the reader already is.
                    .filter((entry) => entry.path !== adminPath())
                    .map((entry) => (
                      <Destination key={entry.path} entry={entry} locale={locale} />
                    ))}
                </ul>
                <Empty>{map.note}</Empty>
              </Stack>
            </Section>
          )}

          <Section title={messages.admin.signedInAs}>
            <dl>
              <KeyValue title={messages.admin.displayName}>{name}</KeyValue>
              <KeyValue title={messages.admin.subject}>
                <code className="text-sm">{sub}</code>
              </KeyValue>
              <KeyValue title={messages.admin.capabilities}>
                {capabilities.length === 0
                  ? <Empty>{messages.admin.notAdmin}</Empty>
                  : (
                      <ul className="flex flex-wrap gap-2">
                        {capabilities.map((capability) => (
                          <li key={capability}><Badge tone="muted">{capability}</Badge></li>
                        ))}
                      </ul>
                    )}
              </KeyValue>
            </dl>
          </Section>

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
 * One place to go, and what is there.
 *
 * The sentence is what makes this a map rather than a second copy of the tab: a
 * curator who has not been here before cannot tell 目録 from サイトコンテンツ by
 * the words alone, and the screens behind them do not overlap.
 */
function Destination({ entry, locale }: { entry: AdminDestination, locale: Locale }) {
  return (
    <li>
      <Link to={href(locale, entry.path)} className="font-semibold">{entry.label}</Link>
      <p className="text-ink-muted text-sm">{entry.note}</p>
      {entry.under !== undefined && (
        <ul className="flex flex-col gap-2 pt-2 pl-6">
          {entry.under.map((child) => (
            <li key={child.path}>
              <Link to={href(locale, child.path)}>{child.label}</Link>
              <p className="text-ink-muted text-sm">{child.note}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
