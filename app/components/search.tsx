import { useCallback, useEffect, useRef, useSyncExternalStore, type ComponentProps, type ReactNode } from "react"
import { Form, Link, useLocation } from "react-router"

import { isAdminPath } from "~/admin/urls"
import { HEADER_BAR_FILL, Button, ButtonLink, Chip, Chooser, CHOOSER_SIDE, CLEAR, CopyButton, CountBubble, Heading, LISTING_CONTROL, MENU_ITEM, MENU_ITEM_HERE, MoreLink, Note, PALE, PANE_LABEL, PaneHeading, Stack, SwitchTabs, Chevron } from "~/components/base"
import { CONTROL } from "~/components/form"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import type { ConditionChip, ListShell } from "~/public/lists.server"
import { exportPath, href, listPath, searchQuery } from "~/public/urls"
import { useAsk, useSearchAsTyped } from "~/search-as-typed"
import type { DateWindow } from "~/search/date-window"
import { PAGE_SIZE, PAGE_SIZES, type PageSize } from "~/search/page-size"
import type { SortKey } from "~/search/query.server"
import { DEFAULT_SORT, defaultOrder, SORT_KEYS, type SortOrder } from "~/search/sort"

import { Card, Code, Crumbs, Page, Paging } from "./page"

/**
 * The search box is a GET form. It sends the keywords under `k` and whatever
 * conditions the box cannot show under `q`, and the listing responds with a
 * redirect to the address the two make together — so the box works with
 * JavaScript turned off and a result can be shared by copying the address.
 *
 * The rounded field and the round pink button are v1's, and the button shows
 * what it does with a glyph and its accessible name rather than a word: it is
 * the same control on the front page and over a listing, at two sizes.
 */
/**
 * The box itself: a rounded field with the round accent button inside it.
 *
 * **Every search on the site is this shape**, whatever it searches. The listings
 * search the index and the announcements are one `ILIKE` over 682 rows, but a
 * reader typing into a box does not know that and should not have to — the
 * announcements screen used to draw its own field with an outlined pill button
 * and a word on it, which read as a different kind of thing entirely.
 *
 * **This is the one control drawn without an edge**: a filled
 * pill with a coloured button in it is not mistakable for anything else on the
 * page, and the rule that requests a visible edge is there for the fields that
 * look like nothing until you find them.
 */
/**
 * Three depths of field, and **the press is the same 36px in all of them**.
 * That is what sets the floor: `compact` is 38.4px, which is
 * the tap size plus the little the field can hold it in, and there is nothing
 * below it that does not make the one control smaller than a control may be.
 */
const SEARCH_FIELD = {
  compact: "py-2 pr-11 pl-4 text-sm",
  normal: "py-2.5 pr-11 pl-4",
  large: "py-2.5 pr-12 pl-5 text-base",
}

/**
 * How large the circle is drawn, which is not how large it can be pressed.
 *
 * **The disc is a fraction of the field rather than a fixed size.** The three
 * depths are 48, 44 and 38.4px; one circle for all of them is three quarters of
 * the deepest and 94% of the shallowest, and at 94% the field stops reading as
 * a box holding a button and becomes a rim around one. Measured: the disc
 * leaves 6px of field above and below it at `large` and 1.2px at `compact`.
 *
 * **The press stays 36px everywhere**: where the disc is smaller
 * than that, a pseudo-element extends the target out to it. So what changes
 * with the field is the paint, and the one thing a rule is written about — how
 * small a control may be — does not change at all.
 */
const SEARCH_DISC = {
  compact: "size-7 after:absolute after:-inset-1 after:content-['']",
  normal: "size-tap",
  large: "size-tap",
}

/** The glyph keeps its share of the disc, so the smaller one is not crowded. */
const SEARCH_GLYPH = {
  compact: "text-xs",
  normal: "text-base",
  large: "text-base",
}

export function SearchBox({ action, name, value, label, placeholder, submit, size = "normal", searchAsTyped = false, keepEmpty = false, children }: {
  action: string
  /** What the typed words are called in the address. */
  name: string
  value: string
  label: string
  placeholder: string
  submit: string
  /**
   * The front page searches with a large one; over a listing it sits at `normal`,
   * and `compact` is for a box sharing its line with something else.
   */
  size?: keyof typeof SEARCH_FIELD
  /**
   * Whether the listing under the box searches as the words are typed.
   *
   * **Only where the box sits over what it searches.** The front page's box
   * sends the reader to another screen, so running it early would mean leaving
   * the page in the middle of a word.
   */
  searchAsTyped?: boolean
  /**
   * Whether an empty field is a condition of its own.
   *
   * **Only where the server merges this field into another one.** The public
   * listings send what was typed as `k` and it is merged into the query it is
   * one condition of, so an empty `k` is how that condition is lifted
   * (`search-as-typed.ts` の `conditions`). Where the box writes the address's
   * own field — every listing in the management area — an empty field is no
   * condition, and writing it would leave the same listing with two addresses.
   */
  keepEmpty?: boolean
  /** What the form has to send that the box does not show. */
  children?: ReactNode
}) {
  const { form, onSubmit, field: typed } = useSearchAsTyped({
    action,
    name,
    enabled: searchAsTyped,
    keepEmpty,
  })
  const field = useRef<HTMLInputElement>(null)

  /*
    The box is uncontrolled, so React does not write a new `value` into it —
    and it must not while the reader is in it, because that is where the value
    is coming from. **The words can also change from somewhere else**: the
    typed word is one of the conditions in force, and lifting it there is what
    empties the search. A box still holding a word the address no longer
    has would search for it again on the next submission.
  */
  useEffect(() => {
    const input = field.current
    if (input === null || input === document.activeElement) return
    if (input.value !== value) input.value = value
  }, [value])

  return (
    // The button sits inside the field rather than beside it, the way v1 draws
    // it: the two are one control, and set apart they read as a box and an
    // unrelated circle. The field keeps room for it on the right.
    <Form
      ref={form}
      onSubmit={onSubmit}
      method="get"
      action={action}
      role="search"
      // Where the box sits over what it searches, submitting it narrows a
      // listing the reader is already looking at, so it holds them where they
      // are. The front page's box is the other case — it goes somewhere else,
      // and arriving there part-way down would be arriving in the middle.
      preventScrollReset={searchAsTyped}
      className="relative flex items-center"
    >
      {children}
      <input
        ref={field}
        type="search"
        name={name}
        defaultValue={value}
        aria-label={label}
        placeholder={placeholder}
        {...typed}
        // The ring goes on the edge of the fill, as it does on a bordered input
        // (`form.tsx` の `CONTROL`): the depth of this field is 38.4px, and a
        // ring standing 2px off a fractional edge is drawn on a different
        // physical pixel than the fill it is meant to follow.
        className={`min-w-0 flex-1 rounded-full bg-surface text-ink focus-visible:-outline-offset-1 ${SEARCH_FIELD[size]}`}
      />
      {/*
        **It stays even where the listing searches as the words are typed**: it
        is what the box means with a keyboard and with no script at all, and
        pressing it only requests what is about to happen anyway.

        The focus ring is drawn around the disc rather than around the target
        it reaches to — a ring standing 5px clear of the circle it marks reads
        as belonging to something else.
      */}
      <button
        type="submit"
        aria-label={submit}
        title={submit}
        className={`absolute inline-flex shrink-0 items-center justify-center rounded-full text-white hover:brightness-90 ${HEADER_BAR_FILL.accent} ${SEARCH_DISC[size]} ${size === "large" ? "right-1.5" : "right-1"}`}
      >
        <Icon name="search" className={SEARCH_GLYPH[size]} />
      </button>
    </Form>
  )
}

export function SearchForm({
  locale,
  target,
  keyword,
  query,
  rows = null,
  size = "normal",
  searchAsTyped = false,
}: {
  locale: Locale
  target: "research" | "dataset"
  keyword: string
  /** The conditions to keep, written out; the box does not show these. */
  query: string
  /**
   * How many rows a page holds, when it is not the default. **Kept across a
   * new search, unlike the ordering**: how much of a listing a reader wants to
   * see at once is about the reader, where the ordering follows what was asked
   * for (a keyword search comes back sorted by how well it matched).
   */
  rows?: number | null
  size?: "compact" | "normal" | "large"
  searchAsTyped?: boolean
}) {
  const messages = messagesFor(locale)
  return (
    <SearchBox
      action={href(locale, listPath(target))}
      name="k"
      value={keyword}
      label={messages.search.searchName[target]}
      // **The long one only on the front page.** That box is the one standing
      // on its own — nothing around it shows what it is about to search, so the
      // grey word has to. Inside a listing the heading, the tabs and the rows
      // have all already said it, and repeating it there spends the width of a
      // 256px field on a word nobody needed. **The name is unchanged either
      // way**, which is what a reader who cannot see the box is told.
      placeholder={size === "large" ? messages.search.searchName[target] : messages.search.searchHint}
      submit={messages.search.submit}
      size={size}
      searchAsTyped={searchAsTyped}
      // The box writes `k`, which the server merges into `q`; emptying it is how
      // the word is lifted out of a query that holds more than the word.
      keepEmpty
    >
      <input type="hidden" name="q" value={query} />
      {rows !== null && <input type="hidden" name="size" value={String(rows)} />}
    </SearchBox>
  )
}

/**
 * The listing beside the pane that refines it.
 *
 * **The pane is three blocks, and only on a wide screen are they adjacent.**
 * What names it comes first, then the box and the conditions in force — they
 * are how the reader searches and how the reader undoes, and both have to be
 * reachable without reading the result first. The twenty-odd dimensions come
 * last: collapsed they are a list of names, and a narrow screen that put them
 * ahead of the result would spend three screens of scrolling on a vocabulary
 * nobody has chosen from yet.
 *
 * **A grid rather than two columns**, because that is what lets the markup run
 * in the order a reader wants it — pane, box, controls, result, dimensions —
 * while a wide screen draws the pane's blocks as one column with the result
 * beside them. Stacking flex columns cannot do both: the pane's parts would
 * have to be one node to sit together, and one node cannot be split around the
 * result.
 *
 * **The first row is one line across both columns.** What names the pane sits
 * on the left, how the result is presented on the right, and the rule under the
 * heading is continued by the table's own first edge — so the two read as one
 * line rather than as two things that nearly line up. **The row is as tall as
 * whichever side is taller and both sit at its foot**, which is what makes the
 * line hold: the heading is 37px, the controls are 38px, and no amount of
 * padding between the controls and the table can close a gap of −1.
 *
 * **The rows have no gap of their own**, since a gap under the first row would
 * push the table off the line again. Each block below leaves its own space.
 *
 * **While the next answer is on its way, what it will replace goes pale.** The
 * pane and the result are exactly the parts a refinement changes — the counts
 * beside the values move as much as the rows do — and everything outside them
 * holds still, so the page reads as one that is responding rather than one that
 * is being rebuilt. **The old answer stays legible** rather than being swapped
 * for a skeleton: it is still true of the search behind it, and at the speed
 * these loaders answer (`app/navigating.ts`) a skeleton would be a flicker.
 */
export function RefinableList({
  open,
  busy,
  locale,
  onToggle,
  inForce,
  refine,
  refineHasMore,
  tools,
  pages,
  panel,
  children,
}: {
  /** Whether the pane is showing what it holds. */
  open: boolean
  /** Whether a refinement of this same listing is still on its way. */
  busy: boolean
  locale: Locale
  /** Collapsing the pane away, and opening it again. */
  onToggle: () => void
  /**
   * How many conditions are narrowing the listing.
   *
   * **What the collapsed pane has to show**: the conditions themselves are shown in
   * the pane, so a collapsible naming nothing would leave a reader looking at a
   * narrowed result with nothing on screen admitting to the narrowing.
   */
  inForce: number
  /** The box and the conditions in force. */
  refine: React.ReactNode
  /**
   * Whether anything is shown under the box in the first group.
   *
   * **A block separates two groups, and there are two only when the first one
   * holds more than the way to search.** With nothing in force, the box and the
   * dimensions are one column of controls with a box at its head, and the step
   * between them is the one inside a group.
   */
  refineHasMore: boolean
  /** How the result is presented, over the table it presents. */
  tools: React.ReactNode
  /**
   * The count and the pagination, under the table.
   *
   * **Only these, and not the whole row over the table.** A reader at the foot
   * of a page is looking for the next one; the ordering and the page size
   * reshape the result and send the reader back to the top of page one, so
   * they have nothing to do where a page has just been read to its end. Absent
   * for a listing that is never paginated.
   */
  pages?: React.ReactNode
  panel: React.ReactNode
  children: React.ReactNode
}) {
  const messages = messagesFor(locale)
  const managing = isAdminPath(useLocation().pathname)
  // The same 4px the row leaves over the table, under it, and at the same right
  // edge the row over the table keeps.
  const foot = pages === undefined || pages === null
    ? null
    : <div className="flex justify-end pt-1">{pages}</div>

  // **Collapsed, there is no pane and so no grid.** The button that reopens it joins the
  // row of controls over the table and is shown at that row's left end, which is
  // the table's own left edge now that nothing is beside it. A grid kept with an
  // empty column would leave the table where it was, and leaving the reopen button
  // in a column of its own would spend the width on the control that exists to
  // give the width back.
  if (!open) {
    return (
      <div className={PALE[busy ? "on" : "off"]} aria-busy={busy}>
        {/* The same 4px the row leaves over the table when the pane is open. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-1">
          <PaneExpand locale={locale} inForce={inForce} onToggle={onToggle} />
          {tools}
        </div>
        <div className="min-w-0">
          {children}
          {foot}
        </div>
      </div>
    )
  }

  return (
    <div
      aria-busy={busy}
      className={`grid gap-x-6 md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-[auto_auto_1fr] lg:grid-cols-[16rem_minmax(0,1fr)] ${PALE[busy ? "on" : "off"]}`}
    >
      <div className="flex flex-col justify-end md:col-start-1 md:row-start-1">
        <PaneHeading title={messages.search.refine.heading} rule="start">
          {/*
            **It is read at the heading's size and has an indicator pointing the
            way it collapses.** At the size the pane's other asides take (12px, no
            glyph) it stands beside a bold heading and is not found — the reader
            has to already know a control is there.

            **In the management area it uses the bordered style**, which has no
            bare words to press; the public listings keep the word.
          */}
          {managing
            ? (
                <Button type="button" size="xs" onClick={onToggle} aria-expanded="true" icon={<Chevron dir="left" />}>
                  {messages.search.refine.collapse}
                </Button>
              )
            : (
                <button
                  type="button"
                  onClick={onToggle}
                  aria-expanded="true"
                  className="group/link inline-flex items-center gap-0.5 font-semibold text-brand text-sm"
                >
                  <Chevron dir="left" />
                  {messages.search.refine.collapse}
                </button>
              )}
        </PaneHeading>
      </div>
      <div className="pt-4 md:col-start-1 md:row-start-2">{refine}</div>
      {/* The same 4px the heading leaves over its rule, so the two sides sit
          the same distance above the line they share. */}
      <div className="flex flex-col justify-end pt-4 pb-1 md:col-start-2 md:row-start-1 md:pt-0">
        {tools}
      </div>
      {/* The result keeps a floor of nothing so that a table wider than the
          column scrolls inside its own box rather than stretching the grid. */}
      <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-2">
        {children}
        {foot}
      </div>
      {/* **The pane is two groups, and the space between them is the widest in
          it.** What it searches with — the box and the conditions in force — is one
          thing, and the dimensions it can narrow by are another; at the step
          that separates the parts of each, the two read as one long column of
          unrelated controls. **With nothing in force there is only one group**,
          and the widest gap in the pane under the box separates it from nothing.

          **The numbers written here are 8px short of what they mean.** The first
          facet's own summary has 8px above it, so what a reader sees is the
          sum: 16 + 8 = 24px between the groups, 8 + 8 = 16px where there is only
          one. **What has to hold is the order, not a particular number** — 24px
          is above the 16px between the parts of a group and the 17px between two
          facets, so the boundary is still the widest thing in the column. A
          block (32px) there was twice the widest gap inside a group, and read as
          a gap rather than as a boundary.

          **So the boundary is written with the same number as the step inside a
          group, and the difference is made by the summary's 8px.** Reading this
          class alone it looks like the two were set alike; they are 16px and
          24px apart on screen, which is the only place the distances are. */}
      <div className={`md:col-start-1 md:row-start-3 ${refineHasMore ? "pt-4" : "pt-2"}`}>
        {panel}
      </div>
    </div>
  )
}

/**
 * The button that reopens a collapsed pane.
 *
 * **An indicator and a count, and no word.** What collapsing gives back is the pane's
 * width, so the button that reopens it keeps as little of that as it can — the glyph
 * shows what it opens and the number shows how much is in force, and the words
 * for both are in the name it announces with.
 *
 * **4px rather than a circle**, for the reason the page numbers beside it keep
 * theirs: a glyph of 16px in a box of 36 does not fill it, and a
 * round box around something that leaves that much air reads as a disc with a
 * symbol on it rather than as one of the controls in the row.
 */
function PaneExpand({ locale, inForce, onToggle }: {
  locale: Locale
  inForce: number
  onToggle: () => void
}) {
  const messages = messagesFor(locale)
  const name = inForce === 0
    ? messages.search.refine.heading
    : messages.search.refine.collapsedWith(inForce)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded="false"
      aria-label={name}
      title={name}
      className={`inline-flex min-h-tap min-w-tap items-center justify-center gap-1 rounded px-2 hover:bg-surface-hover ${LISTING_CONTROL}`}
    >
      <Icon name="filter" aria-hidden="true" />
      <CountBubble count={inForce} tone="brand" />
    </button>
  )
}

/**
 * One thing a listing can be narrowed by, and the boxes it is narrowed with.
 *
 * **It is named the way the public panel names its groups** — the pane's own
 * heading, 8px above what it holds (`components/facets.tsx`) — so that a
 * curator moving between the two sides reads one column, not two arrangements
 * of the same parts.
 */
export function RefineAxis({ label, children }: { label: string, children: ReactNode }) {
  return (
    // A `fieldset` rather than a heading and a list, so the question the boxes
    // answer is announced once instead of on each of them (`form.tsx` の
    // `RadioGroup`).
    <fieldset>
      {/* **The step under the name is the legend's own.** A `legend` is drawn
          out of the box's flow rather than as one of its items, so a gap set on
          the box never reaches it and the name would sit on top of the first
          one. */}
      <legend className={`pb-2 ${PANE_LABEL}`}>{label}</legend>
      {/* **The boxes are shown in from the name**, the way the public panel sets its
          values in under the group they belong to (`components/facets.tsx`) —
          the name says what the group is, and what is in it is one step inside. */}
      <div className="flex flex-col gap-2 pl-2">{children}</div>
    </fieldset>
  )
}

/**
 * A range of days: the windows offered as one press, and the two ends to type.
 *
 * **One piece for the public facets and the management panes**: a reader who
 * learned it over the publication dates finds the same thing over the files. The windows are links, so choosing one is going
 * to the address it identifies — which window is lit is settled where the address
 * was made (`~/search/date-window`). The ends are a GET form that submits the
 * moment either holds a day, and **the form sends what the listing holds
 * beside the range** (`children`), since a GET form replaces the whole query.
 */
export function DateRange({ locale, action, windows, from, to, names = { from: "from", to: "to" }, children }: {
  locale: Locale
  /** Where the form is sent, which is the listing's own address. */
  action: string
  windows: readonly DateWindow[]
  /** The day in force at each end, or empty when that end is open. */
  from: string
  to: string
  /** What the two ends are called in the address. */
  names?: { from: string, to: string }
  /** The fields the form has to send that the range does not show. */
  children?: ReactNode
}) {
  const messages = messagesFor(locale).search.refine
  const { form, ask } = useAsk(action)
  return (
    <Stack gap="tight">
      {windows.length > 0 && (
        <div className="flex gap-1">
          {windows.map((window) => (
            <Link
              key={window.label}
              to={window.href}
              // The reader is in the pane when they press, beside a
              // result they are watching change; landing at the top of the
              // page would take both out of sight (`components/facets.tsx`).
              preventScrollReset
              aria-current={window.current ? "true" : undefined}
              className={`flex-1 rounded border px-1 py-1 text-center text-xs no-underline ${
                window.current
                  ? "border-brand bg-surface-hover font-semibold text-ink"
                  : "border-line text-brand hover:bg-surface-hover"
              }`}
            >
              {window.label}
            </Link>
          ))}
        </div>
      )}
      <Form ref={form} method="get" action={action} preventScrollReset>
        <Stack gap="tight">
          {children}
          <RefineDate name={names.from} label={messages.dateFrom} value={from} ask={ask} />
          <RefineDate name={names.to} label={messages.dateTo} value={to} ask={ask} />
        </Stack>
      </Form>
    </Stack>
  )
}

/**
 * One end of a range of days.
 *
 * **It submits the moment it holds a day**: a
 * date field hands over a whole day or nothing, and most readers hand it over
 * in one press on the picker, so there is nothing to wait for. Clearing it submits
 * too, since an empty end is the end left open.
 *
 * **Its name is shown over it rather than beside it.** The two ends of a range of
 * days stand one above the other with room for a name each, where a number's
 * pair sits side by side in the width of the pane and has none
 * (`components/facets.tsx`).
 */
function RefineDate({ name, label, value, ask }: {
  name: string
  label: string
  /** The day in force at this end, or empty when it is open. */
  value: string
  /** Go to the address the form now stands for. */
  ask: () => void
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-ink-muted text-xs">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        onChange={(event) => {
          if (event.currentTarget.value !== value) ask()
        }}
        // `CONTROL` sizes itself against a 14px line (`form.tsx`); left to the
        // browser's own default for a bare `type="date"` field the line is
        // 16px and the box comes out 38px against the 36.4px every other
        // `CONTROL` in the site has.
        className={`w-full ${CONTROL} text-sm`}
      />
    </label>
  )
}

/** Where the pane remembers whether it is collapsed. */
const PANE_KEY = "humandbs.refine"

const paneListeners = new Set<() => void>()

/**
 * **Reaching the store can throw**, not just come back empty: a browser set to
 * block all storage raises on the property itself. This is a `getSnapshot` and
 * so runs during render, and a throw here would take the whole listing down
 * with it — a reader with storage turned off gets a pane that cannot remember,
 * which is the worst that should happen.
 */
function readPaneOpen(): boolean {
  try {
    return window.sessionStorage.getItem(PANE_KEY) !== "collapsed"
  } catch {
    return true
  }
}

function writePaneOpen(open: boolean): void {
  try {
    window.sessionStorage.setItem(PANE_KEY, open ? "open" : "collapsed")
  } catch {
    return
  }
  // `storage` is not delivered to the tab that wrote, so this tab is told here.
  for (const listener of paneListeners) listener()
}

function subscribePane(listener: () => void): () => void {
  paneListeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    paneListeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** The server has no storage, so the pane is drawn open and collapses on hydration. */
function paneOpenOnServer(): boolean {
  return true
}

/**
 * Whether the pane of conditions is showing what it holds.
 *
 * **It is not in the address.** What an address contains is what would change the
 * rows in the table — the search, the ordering, how many rows a page holds,
 * which page. Collapsing the pane beside them changes none of it, so an address
 * holding the collapsed state would hand whoever it was sent to a screen collapsed the way
 * this reader happened to leave it.
 *
 * **`sessionStorage` rather than `localStorage`**, for the reason the cart uses
 * it: a collapsible is part of what somebody is doing now rather than a setting they
 * keep between visits.
 */
export function usePaneOpen(): [boolean, () => void] {
  const open = useSyncExternalStore(subscribePane, readPaneOpen, paneOpenOnServer)
  const toggle = useCallback(() => {
    writePaneOpen(!readPaneOpen())
  }, [])
  return [open, toggle]
}

/**
 * Words a first-time reader can try, since nothing in the data suggests any.
 *
 * **Filled rather than outlined, and deliberately not a `Chip`**: an outlined
 * chip means a condition in force and includes the link that lifts it. These are
 * examples to press. v1 draws the same distinction.
 *
 * **Small and `soft`**, because they are an aside under the box rather than
 * what the page is requesting: at the size and weight of a button they compete
 * with the two links further down.
 */
export function SearchExamples({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-ink-muted">{messages.search.examples}</span>
      {messages.search.exampleQueries.map((example) => (
        <ButtonLink
          key={example}
          to={href(locale, listPath("research") + searchQuery({ q: example, sort: null, page: 1 }))}
          variant="secondary"
          size="xs"
          icon={<Icon name="search" />}
        >
          {example}
        </ButtonLink>
      ))}
    </div>
  )
}

/**
 * Everything narrowing the result, and the way to lift any of it.
 *
 * **It is shown in the pane, under the box.** A condition is in force until it is
 * taken off, so what shows it belongs beside the thing that puts more of them
 * on — not in a row above the table, where it reads as a caption on the result
 * and scrolls away from the panel that produced it.
 *
 * **Every kind of condition is here.** The panel draws its chosen values as
 * well; a query may also have a field, a negation or a nested group that no
 * facet corresponds to; and **the words typed into the box are among them**,
 * because a word narrows the listing exactly as a chosen value does. A filter
 * working without appearing anywhere is a result the reader cannot explain. One
 * list means one answer to "what is narrowing this", and **one control that
 * lifts all of it — the box included**.
 *
 * **No count.** The chips are the count, and a figure here would be the fourth
 * kind of number on a screen that has already been down to three.
 */
export function AppliedConditions({ conditions, clearHref, locale }: {
  conditions: ConditionChip[]
  /** The search with all of them lifted, or null when there are none. */
  clearHref: string | null
  locale: Locale
}) {
  const messages = messagesFor(locale).search.refine
  if (conditions.length === 0) return null
  return (
    <Stack gap="tight">
      <div className="flex items-center justify-between gap-x-3">
        <span className={PANE_LABEL}>{messages.applied}</span>
        {clearHref !== null && (
          <Link to={clearHref} preventScrollReset className={CLEAR}>{messages.clear}</Link>
        )}
      </div>
      <Stack gap="tight" as="ul">
        {conditions.map((condition) => (
          <li key={`${condition.field ?? ""}\u0000${condition.value}`}>
            <Chip
              {...(condition.field === null ? {} : { field: condition.field })}
              value={(
                <>
                  {/*
                    **The code leads, as it does on the panel** — the two are
                    the same value drawn twice, and a reader looking for what
                    they chose reads down one column of codes rather than
                    hunting for one at the end of a heading that wrapped.
                  */}
                  {condition.code !== null && (
                    <>
                      <Code className="mr-1" muted>{condition.code}</Code>
                      {" "}
                    </>
                  )}
                  {condition.value}
                </>
              )}
              to={condition.href}
              remove={messages.removeCondition(
                condition.field === null
                  ? condition.value
                  : `${condition.field}: ${condition.value}`,
              )}
            />
          </li>
        ))}
      </Stack>
    </Stack>
  )
}

/**
 * How a listing's rows are presented: the key they are ordered by, which way,
 * and how many a page holds.
 *
 * **Every listing that pages has these three the same way**, public or
 * management: only what differs from the bare
 * address is written, choosing a key or a size goes back to the first page, and
 * the form that narrows the listing passes them across (`ListingPresented`).
 * A listing whose order is itself what it shows (the articles, the table of
 * fields) has no `sort`.
 */
export interface Presentation<K extends string> {
  sort?: ListingSort<K>
  size: number
}

export interface ListingSort<K extends string> {
  keys: readonly K[]
  current: K
  order: SortOrder
  /** The key the bare address means. */
  unwritten: K
  /** The direction the bare address means under a key. */
  runs: (key: K) => SortOrder
  /**
   * The direction a key arrives in when it is chosen, where that is not the
   * one the bare address means (the announcements run newest first under
   * every key, and their title still opens at A).
   */
  opens?: (key: K) => SortOrder
  /** What the key is called — the name of the column it orders by. */
  name: (key: K) => string
}

/** The presentation as the address writes it: `null` for what is the default. */
export interface PresentedQuery<K extends string> {
  sort: K | null
  order: SortOrder | null
  size: number | null
}

export function presentedQuery<K extends string>({ sort, size }: Presentation<K>): PresentedQuery<K> {
  return {
    sort: sort === undefined || sort.current === sort.unwritten ? null : sort.current,
    order: sort === undefined || sort.order === sort.runs(sort.current) ? null : sort.order,
    size: size === PAGE_SIZE ? null : size,
  }
}

/**
 * How the rows are ordered.
 *
 * **The key names itself and the direction is welded to it.** They are one
 * setting — a direction on its own shows nothing — so they share an edge the way
 * v1 draws them.
 *
 * **Choosing a key does not keep the direction.** Newest first and the
 * last identifier issued are not the same request, so a key arrives the way
 * that key is read and the reader turns it around from there.
 *
 * **The ordering in force is not the ordering to write down.** A reader who
 * asked for nothing is reading the default, and the bare address already means
 * so — writing it out would put a setting nobody chose into every link on the
 * page.
 */
function SortChoice<K extends string>({ locale, sort, at }: {
  locale: Locale
  sort: ListingSort<K>
  /** The first page under an ordering, written as the address writes it. */
  at: (sort: K | null, order: SortOrder | null) => string
}) {
  const messages = messagesFor(locale)
  const written = sort.current === sort.unwritten ? null : sort.current
  const flipped = sort.order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending
  const flip = (
    <Link
      to={at(written, flipped === sort.runs(sort.current) ? null : flipped)}
      preventScrollReset
      aria-label={turn}
      title={turn}
      className={CHOOSER_SIDE}
    >
      {/* The glyph shows which way the list runs now, not where the link goes. */}
      <Icon name={sort.order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
    </Link>
  )
  return (
    <Chooser label={messages.search.sort.label} value={sort.name(sort.current)} beside={flip}>
      {sort.keys.map((option) => {
        const opens = sort.opens?.(option) ?? sort.runs(option)
        return (
          <Link
            key={option}
            to={at(option === sort.unwritten ? null : option, opens === sort.runs(option) ? null : opens)}
            preventScrollReset
            aria-current={option === sort.current ? "true" : undefined}
            className={option === sort.current ? MENU_ITEM_HERE : MENU_ITEM}
          >
            {sort.name(option)}
          </Link>
        )
      })}
    </Chooser>
  )
}

/**
 * How many rows a page holds.
 *
 * **Every size is an address**, so the choice survives a reload and can be
 * shared; the control is the same one the ordering uses, because the two are
 * the same kind of thing — how the result is presented rather than what it is.
 *
 * **Choosing a size returns to the first page.** The row a reader was looking
 * at is at a different place in a differently sized listing, and the honest
 * answer to "show me a hundred at a time" is the first hundred.
 */
function SizeChoice({ locale, size, at }: {
  locale: Locale
  size: number
  at: (size: number | null) => string
}) {
  const messages = messagesFor(locale)
  return (
    <Chooser label={messages.search.pageSize} value={String(size)}>
      {PAGE_SIZES.map((option) => (
        <Link
          key={option}
          to={at(option === PAGE_SIZE ? null : option)}
          preventScrollReset
          aria-current={option === size ? "true" : undefined}
          className={option === size ? MENU_ITEM_HERE : MENU_ITEM}
        >
          {option}
        </Link>
      ))}
    </Chooser>
  )
}

/**
 * The row over a table: the four right-aligned in one line.
 */
const TOOLS_ROW = "flex flex-wrap items-center justify-end gap-x-6 gap-y-2"

export type ListingPaging = Omit<ComponentProps<typeof Paging>, "locale">

/**
 * Everything about how the result is presented, in one row over the table:
 * the ordering, how many rows a page holds, the count and the way through the
 * pages. Under the table sits `Paging` alone, with the same `paging`.
 *
 * `at` returns the listing's own address under a presentation, on its first
 * page; everything else the reader chose is the screen's to keep.
 */
export function ListingTools<K extends string>({ locale, presented, at, paging }: {
  locale: Locale
  presented: Presentation<K>
  at: (over: PresentedQuery<K>) => string
  paging: ListingPaging
}) {
  const written = presentedQuery(presented)
  return (
    <div className={TOOLS_ROW}>
      {presented.sort !== undefined && (
        <SortChoice
          locale={locale}
          sort={presented.sort}
          at={(sort, order) => at({ ...written, sort, order })}
        />
      )}
      <SizeChoice locale={locale} size={presented.size} at={(size) => at({ ...written, size })} />
      <Paging locale={locale} {...paging} />
    </div>
  )
}

/**
 * How the result is presented, kept across a change of conditions by the
 * form that narrows the listing.
 *
 * **The ordering and the page size are the reader's rather than the
 * listing's**, and dropping them on every search would re-sort and re-cut the
 * listing under the reader. Only what differs from the default is written, so
 * an unnarrowed listing is still the bare address.
 */
export function ListingPresented<K extends string>({ presented }: { presented: Presentation<K> }) {
  const { sort, order, size } = presentedQuery(presented)
  return (
    <>
      {sort !== null && <input type="hidden" name="sort" value={sort} />}
      {order !== null && <input type="hidden" name="order" value={order} />}
      {size !== null && <input type="hidden" name="size" value={String(size)} />}
    </>
  )
}

/** The public listings' ordering, read the way `app/search/sort.ts` reads it. */
function publicSort(locale: Locale, sort: SortKey, order: SortOrder): ListingSort<SortKey> {
  const messages = messagesFor(locale)
  return {
    keys: SORT_KEYS,
    current: sort,
    order,
    unwritten: DEFAULT_SORT,
    runs: defaultOrder,
    name: (key) => messages.search.sort[key],
  }
}

/**
 * How a public listing's rows are ordered. Every ordering is on offer whatever
 * was asked for: what a listing can be sorted by does not depend on the query
 * (`app/search/sort.ts`).
 */
export function SortChooser({ locale, target, query, sort, order, rows }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  sort: SortKey
  order: SortOrder
  /** The page size to keep, or `null` for the default. */
  rows: number | null
}) {
  return (
    <SortChoice
      locale={locale}
      sort={publicSort(locale, sort, order)}
      at={(key, turned) => href(locale, listPath(target) + searchQuery({
        q: query,
        sort: key,
        order: turned,
        page: 1,
        size: rows,
      }))}
    />
  )
}

/** How many rows a page of a public listing holds. */
export function PageSizeChooser({ locale, target, query, sort, order, size }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  /** The ordering to keep, or `null` when nobody asked for one. */
  sort: string | null
  /** The direction to keep, or `null` when it is the one the key runs by. */
  order: string | null
  size: PageSize
}) {
  return (
    <SizeChoice
      locale={locale}
      size={size}
      at={(rows) => href(locale, listPath(target) + searchQuery({
        q: query,
        sort,
        order,
        page: 1,
        size: rows,
      }))}
    />
  )
}

/**
 * How much of the result is on screen and the way through the rest, at the
 * listing's own addresses. Every ordering ends in the row's label, so a row
 * cannot move between pages and be seen twice or not at all.
 */
export function Pagination({ locale, target, query, sort, order, page, pageCount, rows, total, from, to }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  /** The ordering to keep, or `null` when nobody asked for one. */
  sort: string | null
  /** The direction to keep, or `null` when it is the one the key runs by. */
  order: string | null
  page: number
  pageCount: number
  /** The page size to keep, or `null` for the default. */
  rows: number | null
  total: number
  /** 1-based positions of the shown rows within the whole result. */
  from: number
  to: number
}) {
  return (
    <Paging
      locale={locale}
      total={total}
      from={from}
      to={to}
      page={page}
      pageCount={pageCount}
      at={(at) => href(locale, listPath(target) + searchQuery({
        q: query,
        sort,
        order,
        page: at,
        size: rows,
      }))}
    />
  )
}

export function InvalidQuery({ locale, column }: { locale: Locale, column: number }) {
  const messages = messagesFor(locale)
  return (
    <Note kind="danger">
      {messages.search.invalid}
      {" "}
      <span className="text-ink-muted">{column}</span>
    </Note>
  )
}

/**
 * Handing the results over as a table.
 *
 * **Every row the search matched, not the page being looked at**, which is what
 * v1 exports and the only reading under which "export these results" is true.
 * **Both forms are tab-separated**: the file opens in a spreadsheet and the copy
 * goes straight into one. There is no third format — writing an actual workbook
 * would mean a dependency for a file every spreadsheet already reads.
 *
 * Copying needs a browser and the address bar cannot do it, so that one is a
 * control (`CopyButton`, which also shows when it is done); the file is a link,
 * and downloads without any script at all.
 */
function ExportLinks({ locale, target, query, sort }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  /** The ordering to keep, or `null` when nobody asked for one. */
  sort: string | null
}) {
  const messages = messagesFor(locale)
  // **The search is written the way the listing writes it.** Assembling the
  // pairs here instead would spell the same search a second way — an empty `q`
  // and an ordering nobody asked for both end up in the address — and the file
  // would stop being the thing on screen.
  const at = (format: "copy" | "tsv") => {
    const search = new URLSearchParams(searchQuery({ q: query, sort, page: 1 }))
    search.set("format", format)
    return `${href(locale, exportPath(target))}?${search.toString()}`
  }

  return (
    <div className="flex items-center gap-2">
      <CopyButton
        listing
        text={async () => (await fetch(at("copy"))).text()}
        label={messages.search.exportCopy}
        done={messages.copied}
        byHand={messages.copyByHand}
      />
      <ButtonLink to={at("tsv")} external listing icon={<Icon name="download" />}>
        {messages.search.exportTsv}
      </ButtonLink>
    </div>
  )
}

/**
 * The frame both listings sit in.
 *
 * **They are one screen over two kinds of row.** The box, the panel, the
 * ordering, the page links and the export are the same on both, and the pair of
 * tabs at the top right passes the search from one to the other — which is how
 * v1 presents them and why the two files below hold only their own table.
 */
export function ListingScreen({ view, target, heading, panel, empty, children }: {
  view: ListShell
  target: "research" | "dataset"
  /** What this listing is called, which is also where the trail ends. */
  heading: string
  panel: ReactNode
  /** Whether the table below has any rows at all. */
  empty: boolean
  children: ReactNode
}) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const [paneOpen, togglePane] = usePaneOpen()
  const busy = useBusyHere()
  const swap = target === "research" ? "dataset" : "research"
  const sameSettingsFor = (which: "research" | "dataset") =>
    href(locale, listPath(which) + searchQuery({
      q: view.query,
      sort: null,
      page: 1,
      size: view.requestedSize,
    }))
  /*
    The pane: the way to search, what is narrowing the answer, and the same search
    over the other listing. It is built here rather than inside the panel
    because the panel is what a parse error leaves empty, and a reader whose
    query did not parse needs the box more than anyone.

    **The other listing's count belongs here rather than over the table.** It is
    the same search read somewhere else, so it answers "what am I asking" and
    not "what came back — over the result it read as a caption on rows it has
    nothing to do with, and it was shown between the heading and the table where
    the reader had already stopped looking for controls.

    **It is the link out of this pane, so it is drawn as one** (`MoreLink`). Set
    as a sentence it was the only thing in the pane with no shape at all — no
    border like the chips above it and no weight like the dimensions below —
    and readers took it for a note rather than something to press, while the
    tab that goes to the very same address sits at the top of the screen in a
    shape nobody can mistake.

    **It is built from the same `sameSettingsFor` as the tab**, because it is the same
    address. Written out where each is drawn, the two drifted: the tab kept how
    many rows a page holds and this one dropped it, so switching listings from
    the pane silently put the reader back on twenty.
  */
  const other = view.otherCount === null
    ? null
    : (
        <MoreLink to={sameSettingsFor(swap)}>
          {swap === "dataset"
            ? messages.search.alsoInDataset(view.otherCount)
            : messages.search.alsoInResearch(view.otherCount)}
        </MoreLink>
      )
  const refine = (
    <Stack gap="normal">
      <SearchForm
        locale={locale}
        target={target}
        keyword={view.keyword}
        query={view.query}
        rows={view.requestedSize}
        size="compact"
        searchAsTyped
      />
      <AppliedConditions
        locale={locale}
        conditions={view.conditions}
        clearHref={view.clearHref}
      />
      {/* The wrapper keeps the link at the width of its own words: a flex item
          of its own would stretch, and the whole quarter-page row would be
          pressable with most of it blank.

          **It sits at the far edge.** Everything above it in the pane starts at
          the left — the box, the heading over the conditions, each condition —
          so a link starting there too reads as one more condition rather than
          as the way to the same search somewhere else. */}
      {other !== null && <div className="flex justify-end">{other}</div>}
    </Stack>
  )
  /*
    Everything about how the result is presented, in one row.

    **The four belong together and are drawn together, above the table and
    below it identically.** Split over two rows they read as four separate
    facilities; a reader who has just decided against this page has the way to
    the next one, the size of it and the order of it in the same place. A page
    of twenty rows is longer than the window, which is why the row is repeated
    rather than placed once.

    **The order runs from what shapes the result to where the reader is in it**
    — the ordering, then how many rows a page holds, then which of them are on
    screen, then the way to the others. The two that reset to the first page are
    adjacent at the head, and the count sits against the page links because both
    answer "which page of how many am I looking at" (this is the order IBM
    Carbon and MUI put the last three in).

    **The count and the page links are one control here**, drawn as one thing
    with its own inner distance (`page.tsx` の `Paging`) rather than as two of
    the four.
  */
  const pages = (
    <Pagination
      locale={locale}
      target={target}
      query={view.query}
      sort={view.requestedSort}
      order={view.requestedOrder}
      page={view.page}
      pageCount={view.pageCount}
      rows={view.requestedSize}
      total={view.total}
      from={view.rangeFrom}
      to={view.rangeTo}
    />
  )
  const tools = (
    <div className={TOOLS_ROW}>
      <SortChooser
        locale={locale}
        target={target}
        query={view.query}
        sort={view.sort}
        order={view.order}
        rows={view.requestedSize}
      />
      <PageSizeChooser
        locale={locale}
        target={target}
        query={view.query}
        sort={view.requestedSort}
        order={view.requestedOrder}
        size={view.size}
      />
      {pages}
    </div>
  )

  return (
    <Page width="full">
      <div className="flex flex-wrap items-end justify-between gap-x-4">
        <Crumbs locale={locale} current={heading} />
        <SwitchTabs
          label={messages.search.switchListing}
          tabs={[
            {
              label: messages.search.tabResearch,
              to: sameSettingsFor("research"),
              current: target === "research",
            },
            {
              label: messages.search.tabDataset,
              to: sameSettingsFor("dataset"),
              current: target === "dataset",
            },
          ]}
        />
      </div>

      <Card under={false}>
        <Stack gap="normal">
          <Heading title={heading}>
            {/*
              Nothing to hand over when the address could not be read: the query
              the file would have is the empty one, and that is the whole corpus
              rather than the search on screen. **Nothing to hand over when the
              search matched nothing either** — the file is a header row and no
              rows, which is a download that responds to a question nobody asked.
            */}
            {view.parseError === null && !empty && (
              <ExportLinks locale={locale} target={target} query={view.query} sort={view.requestedSort} />
            )}
          </Heading>

          <RefinableList
            open={paneOpen}
            busy={busy}
            locale={locale}
            onToggle={togglePane}
            inForce={view.conditions.length}
            refineHasMore={view.conditions.length > 0 || other !== null}
            refine={refine}
            tools={view.parseError === null && !empty ? tools : null}
            pages={view.parseError === null && !empty ? pages : null}
            panel={panel}
          >
            {view.parseError !== null
              ? <InvalidQuery locale={locale} column={view.parseError.column} />
              : (
                  <Stack gap="normal">{children}</Stack>
                )}
          </RefinableList>
        </Stack>
      </Card>
    </Page>
  )
}
