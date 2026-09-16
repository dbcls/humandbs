import { Form } from "react-router"

import {
  KEY_VALUE_TYPES,
  SETTLED_VOCABULARIES,
} from "~/admin/catalog"
import { catalogAction, catalogPage, type CatalogKeyRow } from "~/admin/catalog.server"
import { adminExperimentFieldPath, adminExperimentFieldsPath } from "~/admin/urls"
import {
  Badge,
  Button,
  Confirm,
  Dialog,
  Heading,
  IconButton,
  MoreLink,
  Stack,
} from "~/components/base"
import {
  Answered,
  Checkbox,
  Editing,
  Field,
  Result,
  Submit,
  Unsaved,
} from "~/components/form"
import { Icon, type IconName } from "~/components/icons"
import { Card, Page, Table, Td } from "~/components/page"
import { RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href } from "~/public/urls"
import { useAsk } from "~/search-as-typed"

import type { Route } from "./+types/admin-experiment-fields"

/**
 * The fields an analysis method is described under.
 *
 * **The type of a field is shown and not editable.** A field typed as a
 * vocabulary or a number is what a refinement is made of, and a refinement
 * needs an aggregation, an input control and a decision about how the existing
 * prose becomes terms — so typing one is a development change, while adding,
 * renaming, reordering and removing free-text fields is administration
 * (docs/data-model.md の「catalog と語彙」).
 *
 * **What a dataset is described under is not here.** Access type and type of
 * data hold what the portal is rather than what the data brings, and the
 * glossary already fixes their words.
 *
 * **The vocabularies are not a list beside the fields.** Each belongs to
 * exactly one field, so it is reached from that field's row — which is what
 * lets its screen be titled with what the terms are the terms *of*.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return catalogPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return catalogAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.catalog.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminExperimentFields({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const { locale } = view
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const [paneOpen, togglePane] = usePaneOpen()

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1) + view.types.length

  /*
    **The order is only offered over the whole listing.** A field's place is its
    place in the public table, so "up" means the field above it there — which,
    in a narrowed listing, is a row that is not on screen. Rather than let a
    press move a row past rows nobody can see, the column stands only while
    nothing is in force.
  */
  const ordered = inForce === 0

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        {actionData !== undefined && (
          <Result ok={actionData.status === "ok"}>
            {actionData.status === "ok" ? t.done : t.problems[actionData.status]}
          </Result>
        )}
      </Answered>
      <Card under={false}>
        <Stack gap="normal">
          {/*
            **The way to make one stands with the name of the screen**, as it
            does over the other listings, and it asks in a panel: a field takes
            a code and two labels before it exists, and three boxes standing
            open under the table are three places to type on a screen whose
            subject is everything else.
          */}
          <Heading title={t.heading} note={t.note}>
            <Form method="post">
              <input type="hidden" name="intent" value="create-key" />
              <Dialog label={t.addKey} title={t.addKey} icon={<Icon name="plus" />}>
                {(close) => (
                  <Stack gap="normal">
                    <Field label={t.code} name="code" width="w-full" />
                    <Field label={t.labelJa} name="labelJa" width="w-full" />
                    <Field label={t.labelEn} name="labelEn" width="w-full" />
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={close}>{t.cancel}</Button>
                      <Submit variant="primary" icon={<Icon name="plus" />}>{t.addKey}</Submit>
                    </span>
                  </Stack>
                )}
              </Dialog>
            </Form>
          </Heading>

          <RefinableList
            open={paneOpen}
            busy={false}
            locale={locale}
            onToggle={togglePane}
            inForce={inForce}
            // The box is never alone in the pane here: three axes stand under it
            // whatever the reader has asked for.
            refineHasMore
            refine={<Filters view={view} locale={locale} />}
            tools={<Matched view={view} locale={locale} />}
            panel={null}
          >
            <Table
              align="middle"
              headers={[
                t.labelJa,
                t.labelEn,
                t.type,
                t.terms,
                ...(ordered ? [t.order] : []),
                /* The column of things to press names itself for anyone reading
                   the row aloud and nowhere else. */
                <span key="actions" className="sr-only">{messages.admin.actions}</span>,
              ]}
              whenEmpty={inForce === 0 ? t.noKey : t.noMatchingKey}
            >
              {view.keys.map((entry, at) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  ordered={ordered}
                  at={at}
                  of={view.keys.length}
                  locale={locale}
                />
              ))}
            </Table>
          </RefinableList>
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * How much is being looked at, over the rows it counts.
 *
 * **There is no range to give**, because the listing is never cut into pages:
 * the number is how many rows are standing out of every field there is. It
 * stands where the other listings put their page size and their way through the
 * pages, so the one place a reader looks for a count is the same on all of them
 * (docs/editing.md の「管理画面」).
 */
function Matched({ view, locale }: {
  view: Route.ComponentProps["loaderData"]
  locale: Locale
}) {
  const t = messagesFor(locale).admin.catalog
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
      <span className="text-ink-muted text-sm">{t.shownOf(view.keys.length, view.total)}</span>
    </div>
  )
}

/**
 * One field.
 *
 * **What the row says is what the field is; what it can be made into is behind
 * the panel.** Everything on the line is read at a glance down a column — the
 * code, the two labels, what it holds, where it stands, whether it is drawn —
 * and none of it is a control that a scanning eye has to step over.
 */
/**
 * The mark a type is drawn with.
 *
 * **What a key holds is a shape before it is a word**, and the shapes are what
 * separate the four kinds at a glance: strokes on a page for prose, a bulleted
 * set for a value picked from one, a number sign for a measured one, a trace
 * for the one vocabulary that carries a tree. A key that names something
 * elsewhere takes the link's mark rather than a shape of its own.
 */
const TYPE_MARK: Record<CatalogKeyRow["valueType"], IconName> = {
  text: "type",
  single: "check",
  accession: "link",
  vocabulary: "list",
  number: "hash",
  disease: "activity",
}

function Row({ entry, ordered, at, of, locale }: {
  entry: CatalogKeyRow
  ordered: boolean
  /** Where the row stands, which is what says whether it can still move. */
  at: number
  of: number
  locale: Locale
}) {
  const t = messagesFor(locale).admin.catalog
  const typed = entry.valueType !== "text"
  const settled = entry.vocabularySetCode !== null
    && SETTLED_VOCABULARIES.has(entry.vocabularySetCode)

  return (
    <tr>
      <Td floor="min-w-40">{entry.labelJa}</Td>
      <Td floor="min-w-40">{entry.labelEn}</Td>
      <Td nowrap>
        <Badge icon={<Icon name={TYPE_MARK[entry.valueType]} />}>
          {entry.canonicalUnit === null
            ? t.types[entry.valueType]
            : `${t.types[entry.valueType]} (${entry.canonicalUnit})`}
        </Badge>
      </Td>
      {/* What the field draws from, when it draws from anything.

          **How many, and the way to them, in one.** The count alone reads as a
          fact about the row; the mark says the cell is a way onward.

          **Both kinds of vocabulary have the screen; only one may be changed
          there.** What a settled vocabulary holds is fixed by what the portal
          is, so its screen refuses every write (`catalog.server.ts`) and draws
          no control — and the word here says so before the press rather than
          after it. */}
      <Td nowrap>
        {entry.terms === null
          ? null
          : (
              <MoreLink to={href(locale, adminExperimentFieldPath(entry.code))}>
                {settled ? t.termCountRead(entry.terms) : t.termCount(entry.terms)}
              </MoreLink>
            )}
      </Td>
      {ordered && (
        <Td holds="mark">
          <span className="flex gap-1">
            <Move id={entry.id} intent="move-key-up" icon="chevron-up" label={t.up} stuck={at === 0} />
            <Move id={entry.id} intent="move-key-down" icon="chevron-down" label={t.down} stuck={at === of - 1} />
          </span>
        </Td>
      )}
      <Td nowrap holds="control">
        <span className="flex items-center gap-1">
          {/* **The save answers what the panel holds**: a row is opened to read
              it as often as to change it, and a save that can always be pressed
              says nothing about whether there is anything to send. */}
          <Editing method="post">
            <input type="hidden" name="keyId" value={entry.id} />
            <Dialog
              label={t.edit}
              title={t.editTitle(entry.code)}
              size="row"
              icon={<Icon name="edit" />}
            >
              {(close) => (
                <Stack gap="normal">
                  <Field
                    label={t.labelJa}
                    name="labelJa"
                    value={entry.labelJa}
                    width="w-full"
                  />
                  <Field
                    label={t.labelEn}
                    name="labelEn"
                    value={entry.labelEn}
                    width="w-full"
                  />
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={close}>{t.cancel}</Button>
                    {/* **The filled face belongs to the screen's own act**, which
                        is making a field; a row's save is the ordinary one
                        (docs/ui.md の「押せるもの」). */}
                    <Submit intent="update-key" icon={<Icon name="save" />} saves>
                      {t.save}
                    </Submit>
                    {/* The face says there is something to send to whoever is
                        looking at it; this says it to whoever is not
                        (docs/ui.md の「管理画面の枠」). */}
                    <Unsaved locale={locale} />
                  </span>
                </Stack>
              )}
            </Dialog>
          </Editing>
          {/* A typed field is a refinement; taking one away is a development
              change too. Its own form: an intent written as a hidden field
              cannot share one with a button that names its own. */}
          {!typed && (
            <Form method="post">
              <input type="hidden" name="keyId" value={entry.id} />
              <Confirm
                label={t.remove}
                title={t.removeTitle(entry.code)}
                warning={t.removeWarning}
                confirm={t.removeConfirm}
                cancel={t.cancel}
                icon="trash"
                size="row"
              >
                <input type="hidden" name="intent" value="delete-key" />
              </Confirm>
            </Form>
          )}
        </span>
      </Td>
    </tr>
  )
}

/**
 * One direction of the ordering.
 *
 * **Each direction stands in its own form.** `IconButton` spends its `name` on
 * the glyph, so two of them in one form have nothing left to tell the press
 * apart by; the intent goes in a hidden field instead.
 *
 * **A glyph has no colour of its own to dim**, so the row's end is said by the
 * box around it.
 */
function Move({ id, intent, icon, label, stuck }: {
  id: string
  intent: string
  icon: IconName
  label: string
  /** At the end it points to, where there is nothing left to swap with. */
  stuck: boolean
}) {
  return (
    <Form method="post">
      <input type="hidden" name="keyId" value={id} />
      <input type="hidden" name="intent" value={intent} />
      <span className={stuck ? "opacity-50" : ""}>
        <IconButton name={icon} label={label} type="submit" disabled={stuck} />
      </span>
    </Form>
  )
}

/**
 * GET forms, so a narrowed listing has an address that can be kept and shared —
 * the same rule the other listings follow.
 *
 * **Nothing here waits to be confirmed.** The box asks once the typing has
 * stopped and a tick asks as it is made.
 *
 * **The box and the ticks are two forms, and each carries what the other
 * holds**, because a form cannot stand inside another.
 */
function Filters({ view, locale }: {
  view: Route.ComponentProps["loaderData"]
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const to = href(locale, adminExperimentFieldsPath())
  const { form, ask } = useAsk(to)
  const carried = (
    <>
      {view.types.map((one) => <input key={one} type="hidden" name="type" value={one} />)}
    </>
  )

  return (
    <Stack gap="normal">
      <SearchBox
        action={to}
        name="q"
        value={view.keyword}
        label={t.find}
        placeholder={messages.search.boxHint}
        submit={messages.search.submit}
        size="compact"
        searchAsTyped
      >
        {carried}
      </SearchBox>

      <Form ref={form} method="get" action={to} onChange={ask} preventScrollReset>
        <input type="hidden" name="q" value={view.keyword} />
        <Stack gap="normal">
          {/* **What a field holds is what it can become**, which is why this is
              the first axis: a refinement is made of the typed ones, and they
              are a fifth of the table. */}
          <RefineAxis label={t.type}>
            {KEY_VALUE_TYPES.map((one) => (
              <Checkbox
                key={one}
                label={t.types[one]}
                name="type"
                value={one}
                checked={view.types.includes(one)}
                count={view.counts.types[one]}
              />
            ))}
          </RefineAxis>
        </Stack>
      </Form>
    </Stack>
  )
}
