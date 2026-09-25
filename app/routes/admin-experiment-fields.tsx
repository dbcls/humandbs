import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useId, useState } from "react"
import { Form, Link, useNavigation, useSubmit } from "react-router"

import {
  KEY_VALUE_TYPES,
  SETTLED_VOCABULARIES,
} from "~/admin/catalog"
import {
  catalogAction,
  catalogPage,
  type CatalogIntent,
  type CatalogKeyRow,
  type Moved,
} from "~/admin/catalog.server"
import { adminExperimentFieldPath, adminExperimentFieldsPath } from "~/admin/urls"
import {
  Badge,
  Button,
  Confirm,
  Dialog,
  Heading,
  IconButton,
  ReorderButtons,
  Stack,
} from "~/components/base"
import {
  Answer,
  Checkbox,
  Editing,
  Field,
  LanguagePair,
  Submit,
  Unsaved,
} from "~/components/form"
import { Icon, type IconName } from "~/components/icons"
import { Card, Counted, Page, Table, Td } from "~/components/page"
import { RefinableList, RefineAxis, SearchBox, usePaneOpen } from "~/components/search"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import { adminWindowTitle } from "~/i18n/title"
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
 * renaming, reordering and removing free-text fields is administration.
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

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.catalog.heading) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminExperimentFields({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const { locale } = view
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()

  // Collapsed, the button that reopens the pane shows how much is in force, because the
  // conditions themselves are in the pane that is no longer on screen.
  const inForce = (view.keyword === "" ? 0 : 1) + view.types.length

  /*
    **The order is only offered over the whole listing.** A field's place is its
    place in the public table, so "up" means the field above it there — which,
    in a narrowed listing, is a row that is not on screen. Rather than let a
    press move a row past rows nobody can see, the column remains only while
    nothing is in force.
  */
  const ordered = inForce === 0

  /*
    **A drop is sent the way an arrow is** — as the form post the screen
    answers (`Answered`) — so the notice that says where the row went, and the
    way to take it back, are the same whichever way the row was moved.

    **A dropped row is shown where it was dropped until the server has said
    so.** The drop is one write (`move-key-to`), and the listing the loader
    sends back after it is the order of record — so the placed order remains
    only while that answer is on its way, and nothing here has to be put back.
  */
  const submit = useSubmit()
  const navigation = useNavigation()
  const [placed, setPlaced] = useState<readonly CatalogKeyRow[] | null>(null)
  const rows = placed !== null && navigation.state !== "idle" ? placed : view.keys
  const settle = (event: DragEndEvent) => {
    const { active, over } = event
    if (over === null || active.id === over.id) return
    const from = rows.findIndex((row) => row.id === active.id)
    const to = rows.findIndex((row) => row.id === over.id)
    if (from === -1 || to === -1) return
    setPlaced(arrayMove([...rows], from, to))
    void submit(
      { intent: "move-key-to", keyId: String(active.id), to: String(to) },
      { method: "post", preventScrollReset: true },
    )
  }

  // A press that moves a little is a press on the handle, not a drag: the
  // handle is a button as far as a screen reader is concerned, and Space on it
  // is what picks the row up for the keyboard (`sortableKeyboardCoordinates`).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const naming = (id: UniqueIdentifier) => {
    const row = rows.find((one) => one.id === id)
    return row === undefined ? String(id) : catalogLabel(row, locale)
  }
  const destinationOf = (id: UniqueIdentifier) => rows.findIndex((one) => one.id === id) + 1
  // What a listener hears: the row by its label, and the place by its number
  // out of how many, since the row's own label implies nothing about where it is.
  const announcements: Announcements = {
    onDragStart: ({ active }) => t.dragStart(naming(active.id)),
    onDragOver: ({ active, over }) =>
      over === null ? undefined : t.dragOver(naming(active.id), destinationOf(over.id), rows.length),
    onDragEnd: ({ active, over }) =>
      over === null
        ? t.dragCancel(naming(active.id))
        : t.dragEnd(naming(active.id), destinationOf(over.id), rows.length),
    onDragCancel: ({ active }) => t.dragCancel(naming(active.id)),
  }
  // Told to the context so that the ids it writes into the markup are the same
  // on the server and in the browser.
  const dnd = useId()

  // **The answer shows what was done, and a move shows where the row went** —
  // the row by its label and the place by its number, as the drag announced it.
  const said = (answer: { did: CatalogIntent, moved?: Moved }) =>
    answer.moved === undefined
      ? t.done[answer.did]
      : t.moved(naming(answer.moved.id), answer.moved.to + 1, answer.moved.of)

  return (
    <Page>
      <Answer
        answer={actionData}
        locale={locale}
        said={(answer) => answer.status === "ok" ? said(answer) : t.problems[answer.status]}
        also={(answer) => answer.status === "ok" && answer.moved !== undefined
          ? <Undo moved={answer.moved} label={t.undo} />
          : undefined}
      />
      <Card under={false}>
        <Stack gap="normal">
          {/*
            **The button that makes one is shown with the name of the screen**, as it
            does over the other listings, and it requests in a panel: a field takes
            two labels before it exists, and two boxes standing open under the
            table are two places to type on a screen whose subject is
            everything else.
          */}
          <Heading title={t.heading} note={t.note}>
            <Form method="post">
              <Dialog
                label={t.addKey}
                title={t.addKey}
                icon={<Icon name="plus" />}
                action={() => <Submit intent="create-key" variant="primary" icon={<Icon name="plus" />}>{t.create}</Submit>}
              >
                {/* **No code is asked for.** It is made from the English
                    label (`admin/catalog.ts` の `codeFrom`) — an address
                    the public side has, not a name to choose. */}
                <LanguagePair>
                  <Field label={t.labelJa} name="labelJa" width="w-full" />
                  <Field label={t.labelEn} name="labelEn" width="w-full" />
                </LanguagePair>
              </Dialog>
            </Form>
          </Heading>

          <RefinableList
            open={paneOpen}
            busy={busy}
            locale={locale}
            onToggle={togglePane}
            inForce={inForce}
            // The box is never alone in the pane here: three axes are shown under it
            // whatever the reader has asked for.
            refineHasMore
            refine={<Filters view={view} locale={locale} />}
            tools={<Counted locale={locale} total={view.keys.length} />}
            panel={null}
          >
            {/* **A row is put where it is dropped, or moved a place at a time.**
                The drag is the quick way through eighty rows; the two arrows
                are the way that needs no pointer, no script and no picking up,
                and the one a narrow screen keeps (the handle is not drawn there,
                where a finger meaning to scroll would move a row instead). Both
                are one write each, so leaving part way through loses nothing.
                Neither stands while the listing is narrowed (`ordered`). */}
            <DndContext
              id={dnd}
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={settle}
              accessibility={{ announcements, screenReaderInstructions: { draggable: t.dragInstructions } }}
            >
              <Table
                actions
                align="middle"
                headers={[
                  t.labelJa,
                  t.labelEn,
                  t.type,
                  t.terms,
                  t.usage,
                  ...(ordered ? [t.order] : []),
                ]}
                whenEmpty={inForce === 0 ? t.noKey : t.noMatchingKey}
              >
                {/* Left out when there is nothing to sort, so that the table
                    still sees no rows and draws `whenEmpty`. */}
                {rows.length === 0
                  ? null
                  : (
                      <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                        {rows.map((entry, at) => (
                          <Row
                            key={entry.id}
                            entry={entry}
                            ordered={ordered}
                            at={at}
                            of={rows.length}
                            locale={locale}
                          />
                        ))}
                      </SortableContext>
                    )}
              </Table>
            </DndContext>
          </RefinableList>
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * One field.
 *
 * **What the row shows is what the field is; what it can be made into is behind
 * the panel.** Everything on the line is read at a glance down a column — the
 * code, the two labels, what it holds, its place in the order, whether it is drawn —
 * and none of it is a control that a scanning eye has to step over.
 */
/**
 * The icon a type is drawn with.
 *
 * **What a key holds is a shape before it is a word**, and the shapes are what
 * separate the four kinds at a glance: strokes on a page for prose, a bulleted
 * set for a value picked from one, a number sign for a measured one, a trace
 * for the one vocabulary that has a tree. A key that identifies something
 * elsewhere takes the link's icon rather than a shape of its own.
 */
const TYPE_ICON: Record<CatalogKeyRow["valueType"], IconName> = {
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
  /** The row's place in the order, which is what shows whether it can still move. */
  at: number
  of: number
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const typed = entry.valueType !== "text"
  const settled = entry.vocabularySetCode !== null
    && SETTLED_VOCABULARIES.has(entry.vocabularySetCode)
  // The row follows the drag by translation only: a scale would change its
  // height, and the rows it passes are laid out from that height.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: !ordered })

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-60" : undefined}
    >
      {/* **A name's column starts at 144px, a sentence's at 160**: a label of
          a few words falls to a second line and stays readable, and the two
          of them beside five columns that cannot collapse are what has to give
          for the table to fit a 1280px window. */}
      <Td floor="min-w-36">{entry.labelJa}</Td>
      <Td floor="min-w-36">{entry.labelEn}</Td>
      <Td nowrap>
        {/* **A kind, not a state, so it is a chip.** The glyph and the word
            are the pair the pane narrows by; the box says the cell holds a
            category of the field rather than something that happened to it.
            Muted, because nothing here is to be picked out of the rows. */}
        <Badge icon={<Icon name={TYPE_ICON[entry.valueType]} aria-hidden="true" />}>
          {entry.canonicalUnit === null
            ? t.types[entry.valueType]
            : `${t.types[entry.valueType]} (${entry.canonicalUnit})`}
        </Badge>
      </Td>
      {/* What the field draws from, when it draws from anything.

          **How many, and the way to them, in one** — the count is a link the
          way the research screen's dataset count is, a cell's value that is
          also where it leads.

          **Both kinds of vocabulary have the screen; only one may be changed
          there.** What a settled vocabulary holds is fixed by what the portal
          is, so its screen refuses every write (`catalog.server.ts`) and draws
          no control — and the word here shows it before the press rather than
          after it. */}
      <Td nowrap>
        {entry.terms === null
          ? null
          : (
              <Link to={href(locale, adminExperimentFieldPath(entry.code))}>
                {settled ? t.termCountRead(entry.terms) : t.termCount(entry.terms)}
              </Link>
            )}
      </Td>
      {/* **How many published datasets say something under this key.** The
          count is a fact about the row and not a way onward: the public search
          narrows by a value of a field (`?q=field:value`) and has no way to ask
          for every dataset that has any value under one, so there is no listing
          this could open. Drafts are not counted, as on the terms screen. */}
      <Td nowrap floor="min-w-20">
        {entry.used === 0
          ? <span className="text-ink-muted">{t.unused}</span>
          : t.usedCount(entry.used)}
      </Td>
      {ordered && (
        <Td holds="icon">
          <span className="flex gap-1">
            {/* **The handle is the only place the row can be taken hold of**:
                the row has other things to press, and a row that can be dragged
                from anywhere is dragged by mistake. Not drawn on a narrow
                screen, where the arrows beside it are the way. */}
            <span className="hidden md:inline-flex">
              <IconButton
                ref={setActivatorNodeRef}
                name="grip"
                label={t.grab}
                type="button"
                {...attributes}
                {...listeners}
              />
            </span>
            <ReorderButtons
              at={at}
              of={of}
              labels={{ up: messages.admin.moveUp, down: messages.admin.moveDown }}
              render={(by, button) => (
                // Each direction is a form of its own: `IconButton` spends its
                // `name` on the glyph, so the intent goes in a hidden field.
                <Form method="post">
                  <input type="hidden" name="keyId" value={entry.id} />
                  <input type="hidden" name="intent" value={by === -1 ? "move-key-up" : "move-key-down"} />
                  {button}
                </Form>
              )}
            />
          </span>
        </Td>
      )}
      <Td nowrap holds="control">
        <span className="flex items-center gap-1">
          {/* **The save determines what the panel holds**: a row is opened to read
              it as often as to change it, and a save that can always be pressed
              says nothing about whether there is anything to send. */}
          <Editing method="post">
            <input type="hidden" name="keyId" value={entry.id} />
            {/* **The panel is named by what kind of thing is in it, not by the
                row.** The boxes hold the row's labels and change as they are
                typed into, so a title that repeated them would be the same
                words twice and then the wrong words. */}
            <Dialog
              label={t.edit}
              title={t.editKeyTitle}
              size="row"
              icon={<Icon name="edit" />}
              action={() => (
                <>
                  {/* **The filled style belongs to the screen's own act**, which
                      is making a field; a row's save is the ordinary one. */}
                  <Submit intent="update-key" icon={<Icon name="save" />} saves>
                    {t.save}
                  </Submit>
                  {/* The style shows there is something to send to whoever is
                      looking at it; this says it to whoever is not. */}
                  <Unsaved locale={locale} />
                </>
              )}
            >
              <LanguagePair>
                <Field label={t.labelJa} name="labelJa" value={entry.labelJa} width="w-full" />
                <Field label={t.labelEn} name="labelEn" value={entry.labelEn} width="w-full" />
              </LanguagePair>
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
                title={t.removeTitle(catalogLabel(entry, locale))}
                warning={t.removeKeyWarning}
                confirm={t.removeConfirm}
                size="row"
                // The trigger stays where it is and shows why it cannot be
                // pressed: a control that vanishes leaves a reader looking
                // for it, and one that opens only to be refused wastes the press.
                disabled={entry.inUse ? t.inUseKey : undefined}
                intent="delete-key"
              />
            </Form>
          )}
        </span>
      </Td>
    </tr>
  )
}

/**
 * The way to take a move back: the same move the other way, sent as the form
 * post every move is.
 *
 * **Only moves are taken back, and only the last one.** A move is one write
 * whose reverse is one write, and the answer that offers this is up for as
 * long as the reader is looking at it — so there is no history to keep, and
 * taking back the taking-back is the same control on the next answer.
 */
function Undo({ moved, label }: { moved: Moved, label: string }) {
  return (
    <Form method="post" preventScrollReset>
      <input type="hidden" name="intent" value="move-key-to" />
      <input type="hidden" name="keyId" value={moved.id} />
      <input type="hidden" name="to" value={moved.from} />
      <Button size="row" icon={<Icon name="undo" />}>{label}</Button>
    </Form>
  )
}

/**
 * GET forms, so a narrowed listing has an address that can be kept and shared —
 * the same rule the other listings follow.
 *
 * **Nothing here waits to be confirmed.** The field sends the query once the typing has
 * stopped and a tick sends it as it is made.
 *
 * **The box and the ticks are two forms, and each has what the other
 * holds**, because a form cannot be nested inside another.
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
        placeholder={messages.search.searchHint}
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
                icon={<Icon name={TYPE_ICON[one]} aria-hidden="true" className="mr-1 text-ink-muted" />}
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
