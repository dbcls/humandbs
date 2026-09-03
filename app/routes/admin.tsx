import { requireActor } from "~/auth/actor.server"
import { Badge, Stack } from "~/components/base"
import { Card, Empty, KeyValue, Page, PageHead, Section, Table, Td } from "~/components/page"
import { getDb } from "~/db/client.server"
import { messagesFor } from "~/i18n/messages"
import { readLocale } from "~/public/urls"
import { upstreamStatus } from "~/upstream/status.server"

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

  return (
    <Page>
      <PageHead label={messages.admin.heading} />
      <Card>
        <Stack gap="block">
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
                        <li key={capability}><Badge tone="muted">{capability}</Badge></li>
                      ))}
                    </ul>
                  )}
            </KeyValue>
          </dl>

          {upstream !== null && (
            <Section title={words.heading}>
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
            </Section>
          )}
        </Stack>
      </Card>
    </Page>
  )
}
