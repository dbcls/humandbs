import { Form, Link } from "react-router"

import { EVENT_ACTIONS, type EventListing, eventsQuery, type EventRow } from "~/admin/events"
import { eventListing } from "~/admin/events.server"
import { adminTasks } from "~/admin/navigation"
import { adminInvitationPath, adminPath, adminResearchPath } from "~/admin/urls"
import { requireActor, requireCapability } from "~/auth/actor.server"
import { listAdmins, revokeAdminOnScreen } from "~/auth/admins.server"
import { cancelInvitation, createInvitation, openInvitations } from "~/auth/invitations.server"
import { ButtonLink, Confirm, CopyButton, Heading, Note, Stack } from "~/components/base"
import { Flag, Stated } from "~/components/flags"
import { Answer, Checkbox, Submit } from "~/components/form"
import { ACTION_ICON, Icon } from "~/components/icons"
import { Card, Code, Empty, KeyValue, Page, Paging, Section, Table, Td } from "~/components/page"
import { DateRange, type ListingPaging, ListingPresented, ListingTools, type Presentation, RefinableList, RefineAxis, usePaneOpen } from "~/components/search"
import { loadConfig, publicOrigin } from "~/config.server"
import { minuteInJst } from "~/dates"
import { getDb } from "~/db/client.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { useBusyHere } from "~/navigating"
import { href, readLocale } from "~/public/urls"
import { upstreamStatus } from "~/upstream/status.server"
import { appVersion } from "~/version.server"

import type { Route } from "./+types/admin"

/**
 * The front page of the management area.
 *
 * **It lists the work, not the screens.** Each section is a verb, and what
 * is shown under it is pressed to begin that work — which is what settles whether
 * 「お知らせ」 is a screen to read or one to write in (`admin/navigation.ts`).
 * The seven screens that need no identity are each under one of them; the
 * twelve about one research, one draft, one document or one field are reached
 * by choosing that thing.
 *
 * **It requests a session but not a capability, and what it holds depends
 * on which.** An administrator gets the work. Somebody holding no capability
 * gets their own `sub` instead — that is what makes the first administrator
 * possible: access is granted by `sub`, nothing else displays one, and somebody
 * has to be able to read theirs before anybody can be granted anything.
 * **An administrator is not shown one**: they are already in, their name is in
 * the account menu, and an administrator holds every capability — so both lists
 * read the same for every administrator there will ever be.
 *
 * **How the site itself is running is here too**, under the work: how the
 * fetches from outside are going, who administers it, what has been done and by
 * whom, and which commit is being served. A failed fetch deliberately leaves the
 * previous values in place, so without a screen a refresh that stopped a week
 * ago looks exactly like one that ran this morning. **They are on this page
 * rather than on screens of their own** because none of them is a piece of work
 * to open: they are what an administrator glances at on the way in.
 *
 * **The address holds the log's conditions and nothing else**, since the log is
 * the one part of the page that is narrowed and paged.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireActor(request)
  const url = new URL(request.url)
  const holdsNothing = actor.capabilities.size === 0
  const reads = actor.capabilities.has("view-unpublished")
  const db = getDb()
  const manages = actor.capabilities.has("manage-admins")
  const [upstream, events, admins, invitations] = await Promise.all([
    reads ? upstreamStatus(db) : null,
    reads ? eventListing(db, url.searchParams) : null,
    manages ? listAdmins(db) : null,
    manages ? openInvitations(db) : null,
  ])
  return {
    locale: readLocale(url.pathname).locale,
    // Only somebody who cannot do anything yet is told their own identifier.
    sub: holdsNothing ? actor.sub : null,
    me: actor.sub,
    upstream,
    events,
    admins: admins?.map((admin) => ({
      sub: admin.sub,
      name: admin.name,
      since: admin.since.toISOString(),
      lastSeen: admin.lastSeen?.toISOString() ?? null,
    })) ?? null,
    invitations: invitations?.map((one) => ({
      id: one.id,
      createdByName: one.createdByName,
      createdAt: one.createdAt.toISOString(),
      expiresAt: one.expiresAt.toISOString(),
    })) ?? null,
    version: reads ? appVersion() : null,
  }
}

export type AdminsAnswer
  = | { status: "ok", done: "invited", link: string }
    | { status: "ok", done: "cancelled" }
    | { status: "ok", done: "revoked", name: string }
    | { status: "refused", reason: "absent" | "self" | "last" | "gone" }

/**
 * Inviting, and taking away, from the list of administrators. The rules that
 * keep somebody able to administer from the screen are in `revokeAdminOnScreen`.
 *
 * **A new link is in the answer and nowhere else**: only its hash is kept, so
 * this is the one moment it can be shown.
 */
export async function action({ request }: Route.ActionArgs): Promise<AdminsAnswer> {
  const actor = await requireCapability(request, "manage-admins")
  const form = await request.formData()
  const intent = form.get("intent")
  const typed = (name: string): string => {
    const value = form.get(name)
    return typeof value === "string" ? value.trim() : ""
  }
  const db = getDb()

  if (intent === "create-invitation") {
    const token = await createInvitation(db, actor)
    const origin = publicOrigin(loadConfig(process.env).auth)
    return { status: "ok", done: "invited", link: `${origin}${adminInvitationPath(token)}` }
  }
  if (intent === "cancel-invitation") {
    return await cancelInvitation(db, typed("invitationId"))
      ? { status: "ok", done: "cancelled" }
      : { status: "refused", reason: "gone" }
  }
  const sub = typed("sub")
  const outcome = await revokeAdminOnScreen(db, actor, sub)
  return outcome === "revoked"
    ? { status: "ok", done: "revoked", name: typed("name") || sub }
    : { status: "refused", reason: outcome }
}

function adminsSaid(answer: AdminsAnswer, locale: Locale): string {
  const t = messagesFor(locale).admin.admins
  if (answer.status === "ok") {
    if (answer.done === "invited") return t.invitations.created
    if (answer.done === "cancelled") return t.invitations.cancelled
    return t.revoked(answer.name)
  }
  const reasons: Record<typeof answer.reason, string> = {
    absent: t.absent,
    self: t.self,
    last: t.last,
    gone: t.invitations.gone,
  }
  return reasons[answer.reason]
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.overview) },
    { name: "robots", content: "noindex" },
  ]
}

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, sub, upstream, events, admins, invitations, me, version } = loaderData
  const messages = messagesFor(locale)
  const words = messages.admin.caches

  return (
    <Page>
      <Answer answer={actionData} locale={locale} said={(answer) => adminsSaid(answer, locale)} />
      <Card under={false}>
        <Stack gap="block">
          <Heading title={messages.admin.overview} />

          {sub === null
            ? adminTasks(locale).map((task) => (
                <Section key={task.title} title={task.title}>
                  <Stack gap="tight">
                    {task.note !== undefined && <Empty>{task.note}</Empty>}
                    {/* The links share a floor width. Left to their labels
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
                          <Submit variant="primary" icon={<Icon name={task.action.icon} />}>
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
                <Table headers={[words.source, words.state, words.rows, words.lastSuccess]}>
                  {upstream.map((row) => (
                    <tr key={row.source}>
                      <Td>{words.sources[row.source]}</Td>
                      {/* **Every row has one of the three, so a fetch that
                          worked or has not run is an indicator and a word; only a
                          failure is a box.** The
                          reason it gave is a sentence rather than a state, so
                          it stands under the box. */}
                      <Td>
                        {row.failure !== null
                          ? (
                              <Stack gap="tight">
                                <Flag kind="stops">{words.failed}</Flag>
                                <span className="text-ink-muted text-sm">{row.failure}</span>
                              </Stack>
                            )
                          : row.succeededAt === null
                            ? <Stated kind="waiting">{words.never}</Stated>
                            : <Stated kind="resolved">{words.ok}</Stated>}
                      </Td>
                      <Td nowrap>{row.rowCount}</Td>
                      <Td nowrap>
                        {row.succeededAt === null
                          ? <span className="text-ink-muted">{words.never}</span>
                          : minuteInJst(row.succeededAt)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </Stack>
            </Section>
          )}

          {admins !== null && (
            <Admins
              admins={admins}
              invitations={invitations ?? []}
              created={actionData?.status === "ok" && actionData.done === "invited" ? actionData.link : null}
              me={me}
              locale={locale}
            />
          )}

          {events !== null && <Events view={events} locale={locale} />}

          {upstream !== null && (
            <Section title={messages.admin.version.label}>
              {version === null
                ? <Empty>{messages.admin.version.unknown}</Empty>
                : <Code>{version}</Code>}
            </Section>
          )}
        </Stack>
      </Card>
    </Page>
  )
}

interface InvitationView {
  id: string
  createdByName: string
  createdAt: string
  expiresAt: string
}

/**
 * The links that can still make somebody an administrator, and the way to make
 * one. **A link just made is shown above them with a copy button**, since the
 * list can only name who made each one and when: the value itself is gone.
 */
function Invitations({ invitations, created, locale }: {
  invitations: InvitationView[]
  created: string | null
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.admins.invitations
  return (
    <Stack gap="tight">
      <h3 className="font-semibold text-sm">{t.heading}</h3>
      <Empty>{t.note}</Empty>
      <Form method="post">
        <Submit intent="create-invitation" variant="primary" icon={<Icon name={ACTION_ICON.create} />}>{t.create}</Submit>
      </Form>
      {created !== null && (
        <Note kind="done">
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-sm">{t.link}</span>
            <Code size="sm">{created}</Code>
            <CopyButton
              size="xs"
              text={created}
              label={t.copy}
              done={messages.copied}
              byHand={messages.copyByHand}
            />
          </span>
        </Note>
      )}
      <Table headers={[t.createdBy, t.createdAt, t.expiresAt]} actions align="middle" whenEmpty={t.none}>
        {invitations.map((one) => (
          <tr key={one.id}>
            <Td>{one.createdByName}</Td>
            <Td nowrap>{minuteInJst(one.createdAt)}</Td>
            <Td nowrap>{minuteInJst(one.expiresAt)}</Td>
            <Td nowrap>
              <Form method="post">
                <input type="hidden" name="invitationId" value={one.id} />
                <Confirm
                  label={t.cancel}
                  title={t.cancelTitle}
                  subject={[
                    { name: t.createdBy, value: one.createdByName },
                    { name: t.createdAt, value: minuteInJst(one.createdAt) },
                  ]}
                  warning={t.cancelWarning}
                  confirm={t.cancel}
                  intent="cancel-invitation"
                  size="row"
                />
              </Form>
            </Td>
          </tr>
        ))}
      </Table>
    </Stack>
  )
}

interface AdminView {
  sub: string
  name: string
  since: string
  lastSeen: string | null
}

/**
 * Who administers the portal, and the two things done to that list.
 *
 * **The columns keep the order every table keeps**: the name, the identifier
 * it stands for, then the two dates. The last sign-in is what shows an account
 * nobody uses any more.
 *
 * **One's own row cannot be taken away**, and shows why rather than being left
 * out: the reader should see that they are on the list.
 */
function Admins({ admins, invitations, created, me, locale }: {
  admins: AdminView[]
  invitations: InvitationView[]
  /** The link just made, shown until the reader leaves: it cannot be read back. */
  created: string | null
  me: string
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.admins
  return (
    <Section title={t.heading}>
      <Stack gap="normal">
        <Table
          headers={[t.name, messages.admin.subject, t.since, t.lastSeen]}
          actions
          align="middle"
        >
          {admins.map((admin) => (
            <tr key={admin.sub}>
              <Td>
                <span className="flex items-center gap-2">
                  {admin.name}
                  {admin.sub === me && <Flag kind="you">{t.you}</Flag>}
                </span>
              </Td>
              <Td nowrap><Code size="sm">{admin.sub}</Code></Td>
              <Td nowrap>{minuteInJst(admin.since)}</Td>
              <Td nowrap>
                {admin.lastSeen === null
                  ? <span className="text-ink-muted">{t.neverSignedIn}</span>
                  : minuteInJst(admin.lastSeen)}
              </Td>
              <Td nowrap>
                <Form method="post">
                  <input type="hidden" name="sub" value={admin.sub} />
                  <input type="hidden" name="name" value={admin.name} />
                  <Confirm
                    label={t.remove}
                    title={t.removeTitle}
                    subject={{ name: t.name, value: admin.name }}
                    warning={t.removeWarning}
                    confirm={t.removeConfirm}
                    intent="revoke-admin"
                    size="row"
                    disabled={admin.sub === me ? t.cannotRemoveSelf : undefined}
                  />
                </Form>
              </Td>
            </tr>
          ))}
        </Table>

        <Invitations invitations={invitations} created={created} locale={locale} />
      </Stack>
    </Section>
  )
}

/**
 * The audit trail, newest first, narrowed the way the other management lists
 * are: the conditions in a pane at the left, the page size and the pages over
 * the rows. **It has no ordering to choose**: a log is read from the latest.
 *
 * **The columns keep the order every table keeps** — what was acted on, what
 * was done, by whom, then when.
 */
function Events({ view, locale }: { view: EventListing, locale: Locale }) {
  const messages = messagesFor(locale)
  const t = messages.admin.events
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()
  const inForce = view.actions.length + view.actors.length + (view.from === null && view.to === null ? 0 : 1)
  const presented: Presentation<never> = { size: view.size }
  const paging: ListingPaging = {
    total: view.total,
    from: view.rangeFrom,
    to: view.rangeTo,
    page: view.page,
    pageCount: view.pageCount,
    at: (page) => eventsAt(view, locale, { page }),
    // The log is the last section of a long page: a step that scrolled to the
    // top would leave the reader looking for the table they were paging.
    inPlace: true,
  }

  return (
    <Section title={t.heading}>
      <RefinableList
        open={paneOpen}
        busy={busy}
        locale={locale}
        onToggle={togglePane}
        inForce={inForce}
        refineHasMore
        refine={<EventFilters view={view} locale={locale} />}
        tools={(
          <ListingTools
            locale={locale}
            presented={presented}
            at={(over) => eventsAt(view, locale, { size: over.size, page: 1 })}
            paging={paging}
          />
        )}
        pages={<Paging locale={locale} {...paging} />}
        panel={null}
      >
        <Table
          headers={[t.subject, t.action, t.actor, t.occurredAt]}
          whenEmpty={inForce === 0 ? t.none : t.noMatch}
        >
          {view.rows.map((row) => <EventLine key={row.id} row={row} locale={locale} />)}
        </Table>
      </RefinableList>
    </Section>
  )
}

function EventLine({ row, locale }: { row: EventRow, locale: Locale }) {
  const t = messagesFor(locale).admin.events
  const { subject } = row
  return (
    <tr>
      <Td floor="min-w-48">
        {/* What kind of thing it was, then what it is called: a hum label and a
            file name read alike, and a deleted one is only a name. */}
        <span className="mr-2 text-ink-muted text-xs">{t.kinds[subject.kind]}</span>
        {subject.name === null
          ? <span className="text-ink-muted">{t.gone}</span>
          : subject.researchId === null
            ? subject.name === "" ? <span className="text-ink-muted">{t.unnamed}</span> : subject.name
            : <Link to={href(locale, adminResearchPath(subject.researchId))}>{subject.name}</Link>}
      </Td>
      <Td nowrap>{t.actions[row.action]}</Td>
      <Td nowrap>{row.actor}</Td>
      <Td nowrap>{minuteInJst(row.occurredAt)}</Td>
    </tr>
  )
}

/**
 * GET forms, so a narrowed log has an address that can be kept and shared.
 *
 * **Every kind of operation is listed, a count of nought included**, unlike the
 * listings' panels: the kinds are a fixed set of eighteen, and the list is also
 * what shows which operations are recorded at all — the ones nobody has done
 * yet are the ones a reader would otherwise not know to look for.
 */
function EventFilters({ view, locale }: { view: EventListing, locale: Locale }) {
  const t = messagesFor(locale).admin.events
  const to = href(locale, adminPath())
  const kept = (
    <>
      {view.actions.map((one) => <input key={`a-${one}`} type="hidden" name="action" value={one} />)}
      {view.actors.map((one) => <input key={`p-${one}`} type="hidden" name="actor" value={one} />)}
      <ListingPresented presented={{ size: view.size }} />
    </>
  )
  return (
    <Stack gap="normal">
      <Form method="get" action={to} onChange={(change) => { change.currentTarget.requestSubmit() }} preventScrollReset>
        {view.from !== null && <input type="hidden" name="from" value={view.from} />}
        {view.to !== null && <input type="hidden" name="to" value={view.to} />}
        <ListingPresented presented={{ size: view.size }} />
        <Stack gap="normal">
          <RefineAxis label={t.action}>
            {EVENT_ACTIONS.map((one) => (
              <Checkbox
                key={one}
                label={t.actions[one]}
                name="action"
                value={one}
                checked={view.actions.includes(one)}
                count={view.counts[one]}
              />
            ))}
          </RefineAxis>
          <RefineAxis label={t.actor}>
            {view.actorOptions.map((one) => (
              <Checkbox
                key={one.sub}
                label={one.name}
                name="actor"
                value={one.sub}
                checked={view.actors.includes(one.sub)}
                count={one.count}
              />
            ))}
          </RefineAxis>
        </Stack>
      </Form>
      <RefineAxis label={t.day}>
        <DateRange locale={locale} action={to} windows={[]} from={view.from ?? ""} to={view.to ?? ""}>
          {kept}
        </DateRange>
      </RefineAxis>
    </Stack>
  )
}

/** The log under a different setting, the other conditions kept. */
function eventsAt(
  view: EventListing,
  locale: Locale,
  over: { size?: EventListing["size"] | null, page: number },
): string {
  const size = "size" in over ? over.size ?? null : (view.size === 20 ? null : view.size)
  return href(locale, adminPath() + eventsQuery({
    actions: view.actions,
    actors: view.actors,
    from: view.from,
    to: view.to,
    size,
    page: over.page,
  }))
}
