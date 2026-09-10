import { Form } from "react-router"

import { adminTasks } from "~/admin/navigation"
import { requireActor } from "~/auth/actor.server"
import { Badge, ButtonLink, Heading, Note, Stack } from "~/components/base"
import { Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Empty, KeyValue, Page, Section, Table, Td } from "~/components/page"
import { minuteInJst } from "~/dates"
import { getDb } from "~/db/client.server"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"
import { upstreamStatus } from "~/upstream/status.server"

import type { Route } from "./+types/admin"

/**
 * The way into the management area.
 *
 * **It lists the work, not the screens.** Each section is a verb, and what
 * stands under it is pressed to begin that work — which is what settles whether
 * 「お知らせ」 is a screen to read or one to write in (`admin/navigation.ts`).
 * The seven screens that need no identity are each under one of them; the
 * twelve about one research, one draft, one document or one field are reached
 * by choosing that thing.
 *
 * **It asks for a session but not for a capability, and what it holds depends
 * on which.** An administrator gets the work. Somebody holding no capability
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
    { title: `${messages.admin.overview} - ${messages.siteName}` },
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
          <Heading title={messages.admin.overview} />

          {sub === null
            ? adminTasks(locale).map((task) => (
                <Section key={task.title} title={task.title}>
                  <Stack gap="tight">
                    {task.note !== undefined && <Empty>{task.note}</Empty>}
                    {/* The ways in share a floor width. Left to their labels
                        they run from two characters to ten, and a row of boxes
                        each stopping somewhere else reads as a ragged edge
                        rather than as one list. The floor clears the longest
                        label in either language, so every box in the area is
                        drawn to one width; a longer name added later grows past
                        it rather than being cut. */}
                    <div className="flex flex-wrap gap-3 [&_a]:min-w-48 [&_button]:min-w-48">
                      {task.links.map((link) => (
                        <ButtonLink
                          key={link.path}
                          to={href(locale, link.path)}
                          icon={<Icon name={link.icon} />}
                        >
                          {link.label}
                        </ButtonLink>
                      ))}
                      {/* Where the form goes is where what it makes is edited,
                          so the screen that holds the action is the listing
                          rather than this one. */}
                      {task.action !== undefined && (
                        <Form method="post" action={href(locale, task.action.to)}>
                          <Submit icon={<Icon name={task.action.icon} />}>
                            {task.action.label}
                          </Submit>
                        </Form>
                      )}
                    </div>
                  </Stack>
                </Section>
              ))
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
                      <Td nowrap>{row.succeededAt === null ? "—" : minuteInJst(row.succeededAt)}</Td>
                      <Td nowrap>{row.rowCount ?? "—"}</Td>
                      {/* The reason a fetch gave is a sentence rather than a
                          state, so the badge says which of the three it is and
                          the sentence stands under it. */}
                      <Td>
                        {row.failure !== null
                          ? (
                              <Stack gap="tight">
                                <Badge tone="danger" icon={<Icon name="alert" />}>{words.failed}</Badge>
                                <span className="text-ink-muted text-sm">{row.failure}</span>
                              </Stack>
                            )
                          : row.succeededAt === null
                            ? <Badge dashed>{words.never}</Badge>
                            : <Badge icon={<Icon name="check" />}>{words.ok}</Badge>}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </Stack>
            </Section>
          )}
        </Stack>
      </Card>
    </Page>
  )
}
