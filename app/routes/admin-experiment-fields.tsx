import { Form, Link } from "react-router"

import {
  KEY_SHOWINGS,
  KEY_VALUE_TYPES,
  NO_BOX,
  SETTLED_VOCABULARIES,
} from "~/admin/catalog"
import { catalogAction, catalogPage, type CatalogKeyRow } from "~/admin/catalog.server"
import { adminExperimentFieldPath, adminExperimentFieldsPath } from "~/admin/urls"
import {
  Button,
  Confirm,
  Dialog,
  Heading,
  Stack,
} from "~/components/base"
import {
  Answered,
  Checkbox,
  Editing,
  Field,
  Result,
  Select,
  Submit,
  Unsaved,
} from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Table, Td } from "~/components/page"
import { RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { catalogLabel } from "~/i18n/catalog-label"
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

/** A box of the public panel, as both the pane and a row's cell name it. */
interface Box {
  /** The id a form posts, which is what the row is stored by. */
  id: string
  /** The code the address narrows by. */
  code: string
  label: string
}

export default function AdminExperimentFields({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const { locale } = view
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const [paneOpen, togglePane] = usePaneOpen()

  // A box drawn without a heading still has to be pickable here, and its code
  // is the only name it has.
  const boxes: Box[] = view.categories.map((category) => ({
    id: category.id,
    code: category.code,
    label: catalogLabel({ ...category, labelEn: category.labelEn ?? category.code }, locale),
  }))

  // Folded, the way back into the pane says how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1)
    + view.types.length
    + view.boxes.length
    + view.showing.length

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
                    <Checkbox label={t.showOnPublicPage} name="showOnPublicPage" checked />
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
            refine={<Filters view={view} boxes={boxes} locale={locale} />}
            tools={<Counted view={view} locale={locale} />}
            panel={null}
          >
            <Table
              headers={[
                t.code,
                t.labelJa,
                t.labelEn,
                t.type,
                t.category,
                t.terms,
                t.publicPage,
                ...(ordered ? [t.order] : []),
                /* The column of things to press names itself for anyone reading
                   the row aloud and nowhere else. */
                <span key="actions" className="sr-only">{messages.admin.actions}</span>,
              ]}
              whenEmpty={inForce === 0 ? t.noKey : t.noMatchingKey}
            >
              {view.keys.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  boxes={boxes}
                  ordered={ordered}
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
function Counted({ view, locale }: {
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
function Row({ entry, boxes, ordered, locale }: {
  entry: CatalogKeyRow
  boxes: Box[]
  ordered: boolean
  locale: Locale
}) {
  const t = messagesFor(locale).admin.catalog
  const typed = entry.valueType !== "text"
  const settled = entry.vocabularySetCode !== null
    && SETTLED_VOCABULARIES.has(entry.vocabularySetCode)
  const box = boxes.find((one) => one.id === entry.categoryId)

  return (
    <tr>
      <Td nowrap><code className="text-xs">{entry.code}</code></Td>
      <Td floor="min-w-40">{entry.labelJa}</Td>
      <Td floor="min-w-40">{entry.labelEn}</Td>
      <Td nowrap>
        {entry.canonicalUnit === null
          ? t.types[entry.valueType]
          : `${t.types[entry.valueType]} (${entry.canonicalUnit})`}
      </Td>
      <Td nowrap>{box?.label ?? <span className="text-ink-muted">{t.noCategory}</span>}</Td>
      {/* What the field draws from, when it draws from anything. A settled
          vocabulary has no screen: what it may hold is fixed by what the portal
          is, so the cell says so rather than offering a way in. */}
      <Td nowrap>
        {entry.terms === null
          ? null
          : settled
            ? <span className="text-ink-muted">{t.settled}</span>
            : (
                <Link to={href(locale, adminExperimentFieldPath(entry.code))}>
                  {t.termCount(entry.terms)}
                </Link>
              )}
      </Td>
      <Td nowrap>
        <span className="inline-flex items-center text-nowrap">
          <Icon
            name={entry.showOnPublicPage ? "eye" : "eye-off"}
            aria-hidden="true"
            className="mr-1 text-ink-muted"
          />
          {entry.showOnPublicPage ? t.showings.shown : t.showings.hidden}
        </span>
      </Td>
      {ordered && (
        <Td holds="mark">
          <Form method="post" className="flex gap-1">
            <input type="hidden" name="keyId" value={entry.id} />
            <Button
              variant="ghost"
              size="xs"
              name="intent"
              value="move-key-up"
              aria-label={t.up}
              title={t.up}
              icon={<Icon name="chevron-up" />}
            />
            <Button
              variant="ghost"
              size="xs"
              name="intent"
              value="move-key-down"
              aria-label={t.down}
              title={t.down}
              icon={<Icon name="chevron-down" />}
            />
          </Form>
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
                  <Select
                    label={t.category}
                    name="categoryId"
                    value={entry.categoryId ?? ""}
                    options={[
                      { value: "", label: t.noCategory },
                      ...boxes.map((one) => ({ value: one.id, label: one.label })),
                    ]}
                  />
                  <Checkbox
                    label={t.showOnPublicPage}
                    name="showOnPublicPage"
                    checked={entry.showOnPublicPage}
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
 * GET forms, so a narrowed listing has an address that can be kept and shared —
 * the same rule the other listings follow.
 *
 * **Nothing here waits to be confirmed.** The box asks once the typing has
 * stopped and a tick asks as it is made.
 *
 * **The box and the ticks are two forms, and each carries what the other
 * holds**, because a form cannot stand inside another.
 */
function Filters({ view, boxes, locale }: {
  view: Route.ComponentProps["loaderData"]
  boxes: Box[]
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const to = href(locale, adminExperimentFieldsPath())
  const { form, ask } = useAsk(to)
  const carried = (
    <>
      {view.types.map((one) => <input key={one} type="hidden" name="type" value={one} />)}
      {view.boxes.map((one) => <input key={one} type="hidden" name="box" value={one} />)}
      {view.showing.map((one) => <input key={one} type="hidden" name="shown" value={one} />)}
    </>
  )

  return (
    <Stack gap="normal">
      <SearchBox
        action={to}
        name="q"
        value={view.keyword}
        label={t.find}
        placeholder={t.find}
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
          <RefineAxis label={t.category}>
            {[...boxes, { id: NO_BOX, code: NO_BOX, label: t.noCategory }].map((one) => (
              <Checkbox
                key={one.code}
                label={one.label}
                name="box"
                value={one.code}
                checked={view.boxes.includes(one.code)}
                count={view.counts.boxes[one.code]}
              />
            ))}
          </RefineAxis>
          <RefineAxis label={t.publicPage}>
            {KEY_SHOWINGS.map((one) => (
              <Checkbox
                key={one}
                label={t.showings[one]}
                icon={(
                  <Icon
                    name={one === "shown" ? "eye" : "eye-off"}
                    aria-hidden="true"
                    className="mr-1 text-ink-muted"
                  />
                )}
                name="shown"
                value={one}
                checked={view.showing.includes(one)}
                count={view.counts.showing[one]}
              />
            ))}
          </RefineAxis>
        </Stack>
      </Form>
    </Stack>
  )
}
