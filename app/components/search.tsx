import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { Form, Link } from "react-router"

import {
  BAND_FILL,
  Button,
  ButtonLink,
  Chip,
  Chooser,
  CHOOSER_SIDE,
  CLEAR,
  Heading,
  LISTING_CONTROL,
  MENU_ITEM,
  MENU_ITEM_HERE,
  MoreLink,
  Note,
  PALE,
  PANE_LABEL,
  PaneHeading,
  Stack,
  SwitchTabs,
} from "~/components/base"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useBusyHere } from "~/navigating"
import type { ConditionChip, ListShell } from "~/public/lists.server"
import { exportPath, href, listPath, searchQuery } from "~/public/urls"
import { useSearchAsTyped } from "~/search-as-typed"
import { PAGE_SIZE, PAGE_SIZES, type PageSize } from "~/search/page-size"
import type { SortKey } from "~/search/query.server"
import { DEFAULT_SORT, defaultOrder, SORT_KEYS, type SortOrder } from "~/search/sort"

import { Card, Crumbs, Page, PageLinks } from "./page"

/**
 * The search box is a GET form. It carries the keywords under `k` and whatever
 * conditions the box cannot show under `q`, and the listing answers with a
 * redirect to the address the two make together — so the box works with
 * JavaScript turned off and a result can be shared by copying the address.
 *
 * The rounded field and the round pink button are v1's, and the button says
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
 * **This is the one control drawn without an edge** (`docs/ui.md`): a filled
 * pill with a coloured button in it is not mistakable for anything else on the
 * page, and the rule that asks for a visible edge is there for the fields that
 * look like nothing until you find them.
 */
/**
 * Three depths of field, and **the press is the same 36px in all of them**
 * (`docs/ui.md`). That is what sets the floor: `compact` is 38.4px, which is
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
 * **The press stays 36px everywhere** (`docs/ui.md`): where the disc is smaller
 * than that, a pseudo-element carries the target out to it. So what changes
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

export function SearchBox({ action, name, value, label, placeholder, submit, size = "normal", searchAsTyped = false, children }: {
  action: string
  /** What the typed words are called in the address. */
  name: string
  value: string
  label: string
  placeholder: string
  submit: string
  /**
   * The front page asks with a large one; over a listing it sits at `normal`,
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
  /** What the form has to carry that the box does not show. */
  children?: ReactNode
}) {
  const { form, field: typed } = useSearchAsTyped({ action, enabled: searchAsTyped })
  const field = useRef<HTMLInputElement>(null)

  /*
    The box is uncontrolled, so React does not write a new `value` into it —
    and it must not while the reader is in it, because that is where the value
    is coming from. **The words can also change from somewhere else**: the
    typed word is one of the conditions in force, and lifting it there is what
    empties the search. A box still holding a word the address no longer
    carries would search for it again on the next submission.
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
        pressing it only asks for what is about to happen anyway.

        The focus ring is drawn around the disc rather than around the target
        it reaches to — a ring standing 5px clear of the circle it marks reads
        as belonging to something else.
      */}
      <button
        type="submit"
        aria-label={submit}
        title={submit}
        className={`absolute inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full text-white hover:brightness-90 ${BAND_FILL.accent} ${SEARCH_DISC[size]} ${size === "large" ? "right-1.5" : "right-1"}`}
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
   * How many rows a page holds, when it is not the default. **Carried across a
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
      label={messages.search.boxName[target]}
      // **The long one only on the front page.** That box is the one standing
      // on its own — nothing around it says what it is about to search, so the
      // grey word has to. Inside a listing the heading, the tabs and the rows
      // have all already said it, and repeating it there spends the width of a
      // 256px field on a word nobody needed. **The name is unchanged either
      // way**, which is what a reader who cannot see the box is told.
      placeholder={size === "large" ? messages.search.boxName[target] : messages.search.boxHint}
      submit={messages.search.submit}
      size={size}
      searchAsTyped={searchAsTyped}
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
 * are how the reader asks and how the reader undoes, and both have to be
 * reachable without reading the result first. The twenty-odd dimensions come
 * last: folded they are a list of names, and a narrow screen that put them
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
 * **The rows carry no gap of their own**, since a gap under the first row would
 * push the table off the line again. Each block below leaves its own space.
 *
 * **While the next answer is on its way, what it will replace goes pale.** The
 * pane and the result are exactly the parts a refinement changes — the counts
 * beside the values move as much as the rows do — and everything outside them
 * holds still, so the page reads as one that is answering rather than one that
 * is being rebuilt. **The old answer stays legible** rather than being swapped
 * for a skeleton: it is still true of the search behind it, and at the speed
 * these loaders answer (`app/navigating.ts`) a skeleton would be a flicker.
 */
export function RefinableList({ open, busy, heading, closed, refine, refineHasMore, tools, panel, children }: {
  /** Whether the pane is showing what it holds. */
  open: boolean
  /** Whether a refinement of this same listing is still on its way. */
  busy: boolean
  /** What names the pane. Its rule is the line the table's edge continues. */
  heading: React.ReactNode
  /** What stands in the pane's place while it is folded away. */
  closed: React.ReactNode
  /** The box and the conditions in force. */
  refine: React.ReactNode
  /**
   * Whether anything stands under the box in the first group.
   *
   * **A block separates two groups, and there are two only when the first one
   * holds more than the way to ask.** With nothing in force, the box and the
   * dimensions are one column of controls with a box at its head, and the step
   * between them is the one inside a group.
   */
  refineHasMore: boolean
  /** How the result is presented, over the table it presents. */
  tools: React.ReactNode
  panel: React.ReactNode
  children: React.ReactNode
}) {
  // **Folded, there is no pane and so no grid.** The way back into it joins the
  // row of controls over the table and stands at that row's left end, which is
  // the table's own left edge now that nothing is beside it. A grid kept with an
  // empty column would leave the table where it was, and leaving the way back
  // in a column of its own would spend the width on the control that exists to
  // give the width back.
  if (!open) {
    return (
      <div className={PALE[busy ? "on" : "off"]} aria-busy={busy}>
        {/* The same 4px the row leaves over the table when the pane is open. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-1">
          {closed}
          {tools}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    )
  }

  return (
    <div
      aria-busy={busy}
      className={`grid gap-x-6 md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-[auto_auto_1fr] lg:grid-cols-[16rem_minmax(0,1fr)] ${PALE[busy ? "on" : "off"]}`}
    >
      <div className="flex flex-col justify-end md:col-start-1 md:row-start-1">{heading}</div>
      <div className="pt-4 md:col-start-1 md:row-start-2">{refine}</div>
      {/* The same 4px the heading leaves over its rule, so the two sides sit
          the same distance above the line they share. */}
      <div className="flex flex-col justify-end pt-4 pb-1 md:col-start-2 md:row-start-1 md:pt-0">
        {tools}
      </div>
      {/* The result keeps a floor of nothing so that a table wider than the
          column scrolls inside its own box rather than stretching the grid. */}
      <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-2">{children}</div>
      {/* **The pane is two groups, and the space between them is the widest in
          it.** What it asks with — the box and the conditions in force — is one
          thing, and the dimensions it can narrow by are another; at the step
          that separates the parts of each, the two read as one long column of
          unrelated controls. **With nothing in force there is only one group**,
          and the widest gap in the pane under the box separates it from nothing.

          **The numbers written here are 8px short of what they mean.** The first
          facet's own summary carries 8px above it, so what a reader sees is the
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

/** Where the pane remembers whether it is folded. */
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
    return window.sessionStorage.getItem(PANE_KEY) !== "folded"
  } catch {
    return true
  }
}

function writePaneOpen(open: boolean): void {
  try {
    window.sessionStorage.setItem(PANE_KEY, open ? "open" : "folded")
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

/** The server has no storage, so the pane is drawn open and folds on hydration. */
function paneOpenOnServer(): boolean {
  return true
}

/**
 * Whether the pane of conditions is showing what it holds.
 *
 * **It is not in the address.** What an address carries is what would change the
 * rows in the table — the search, the ordering, how many rows a page holds,
 * which page. Folding the pane beside them changes none of it, so an address
 * carrying the fold would hand whoever it was sent to a screen folded the way
 * this reader happened to leave it.
 *
 * **`sessionStorage` rather than `localStorage`**, for the reason the cart uses
 * it: a fold is part of what somebody is doing now rather than a setting they
 * carry between visits.
 */
function usePaneOpen(): [boolean, () => void] {
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
 * chip means a condition in force and carries the way to lift it. These are
 * examples to press. v1 draws the same distinction.
 *
 * **Small and `soft`**, because they are an aside under the box rather than
 * what the page is asking for: at the size and weight of a button they compete
 * with the two ways in further down.
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
 * **It stands in the pane, under the box.** A condition is in force until it is
 * taken off, so what says so belongs beside the thing that puts more of them
 * on — not in a row above the table, where it reads as a caption on the result
 * and scrolls away from the panel that produced it.
 *
 * **Every kind of condition is here.** The panel draws its chosen values as
 * well; a query may also carry a field, a negation or a nested group that no
 * facet corresponds to; and **the words typed into the box are among them**,
 * because a word narrows the listing exactly as a chosen value does. A filter
 * working without appearing anywhere is a result the reader cannot explain. One
 * list means one answer to "what is narrowing this", and **one control that
 * lifts all of it — the box included**.
 *
 * **No count.** The chips are the count, and a figure here would be the fourth
 * kind of number on a screen that has already been down to three
 * (`docs/public-pages.md` の「一覧」).
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
                      <code className="mr-1 font-mono text-ink-muted">{condition.code}</code>
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
 * How the rows are ordered.
 *
 * **The key names itself and the direction is welded to it.** They are one
 * setting — a direction on its own says nothing — so they share an edge the way
 * v1 draws them. **Every key has two ends worth asking for** now that relevance
 * is not among them (`app/search/sort.ts`), so the welded half is always there.
 *
 * **Choosing a key does not carry the direction over.** Newest first and the
 * last identifier issued are not the same request, so a key arrives the way
 * that key is read and the reader turns it around from there.
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
  const messages = messagesFor(locale)
  const flipped = order === "asc" ? "desc" : "asc"
  const turn = flipped === "asc"
    ? messages.search.sort.toAscending
    : messages.search.sort.toDescending
  // **The ordering in force is not the ordering to write down.** A reader who
  // asked for nothing is reading the default, and the bare address already says
  // so — writing it out would put a setting into every link on the page that
  // nobody chose, which is the same reason the direction below is dropped when
  // it is the one the key runs by.
  const written = sort === DEFAULT_SORT ? null : sort
  const flip = (
    <Link
      to={href(locale, listPath(target) + searchQuery({
        q: query,
        sort: written,
        order: flipped === defaultOrder(sort) ? null : flipped,
        page: 1,
        size: rows,
      }))}
      preventScrollReset
      aria-label={turn}
      title={turn}
      className={CHOOSER_SIDE}
    >
      {/* The glyph says which way the list runs now, not where the link goes. */}
      <Icon name={order === "asc" ? "sort-asc" : "sort-desc"} aria-hidden="true" />
    </Link>
  )
  return (
    <Chooser label={messages.search.sort.label} value={messages.search.sort[sort]} beside={flip}>
      {/* Every ordering is on offer whatever was asked for: what a listing can
          be sorted by does not depend on the query (`app/search/sort.ts`). */}
      {SORT_KEYS.map((option) => (
        <Link
          key={option}
          to={href(locale, listPath(target) + searchQuery({
            q: query,
            sort: option === DEFAULT_SORT ? null : option,
            page: 1,
            size: rows,
          }))}
          preventScrollReset
          aria-current={option === sort ? "true" : undefined}
          className={option === sort ? MENU_ITEM_HERE : MENU_ITEM}
        >
          {messages.search.sort[option]}
        </Link>
      ))}
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
  const messages = messagesFor(locale)
  return (
    <Chooser label={messages.search.pageSize} value={String(size)}>
      {PAGE_SIZES.map((option) => (
        <Link
          key={option}
          to={href(locale, listPath(target) + searchQuery({
            q: query,
            sort,
            order,
            page: 1,
            size: option === PAGE_SIZE ? null : option,
          }))}
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
 * Page links, and nothing clever. Every ordering ends in the row's label, so a
 * row cannot move between pages and be seen twice or not at all.
 */
export function Pagination({ locale, target, query, sort, order, page, pageCount, rows }: {
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
}) {
  const messages = messagesFor(locale)
  return (
    <PageLinks
      label={messages.search.pagination}
      page={page}
      pageCount={pageCount}
      at={(to) => href(locale, listPath(target) + searchQuery({
        q: query,
        sort,
        order,
        page: to,
        size: rows,
      }))}
      previous={messages.search.previousPage}
      next={messages.search.nextPage}
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
 * control; the file is a link, and downloads without any script at all.
 */
function ExportLinks({ locale, target, query, sort }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  /** The ordering to carry, or `null` when nobody asked for one. */
  sort: string | null
}) {
  const messages = messagesFor(locale)
  const [copied, setCopied] = useState(false)
  // **The search is written the way the listing writes it.** Assembling the
  // pairs here instead would spell the same search a second way — an empty `q`
  // and an ordering nobody asked for both end up in the address — and the file
  // would stop being the thing on screen.
  const at = (format: "copy" | "tsv") => {
    const search = new URLSearchParams(searchQuery({ q: query, sort, page: 1 }))
    search.set("format", format)
    return `${href(locale, exportPath(target))}?${search.toString()}`
  }

  async function copy() {
    const answer = await fetch(at("copy"))
    await navigator.clipboard.writeText(await answer.text())
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        listing
        icon={<Icon name="copy" />}
        onClick={() => { void copy() }}
      >
        {copied ? messages.search.exportCopied : messages.search.exportCopy}
      </Button>
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
 * tabs at the top right carries the search from one to the other — which is how
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
  // What the folded pane announces with, since on screen it is a mark and a
  // number: the pane's own name, and how much is in force behind it.
  const folded = view.conditions.length === 0
    ? messages.search.refine.heading
    : messages.search.refine.foldedWith(view.conditions.length)
  const swap = target === "research" ? "dataset" : "research"
  const carry = (which: "research" | "dataset") =>
    href(locale, listPath(which) + searchQuery({
      q: view.query,
      sort: null,
      page: 1,
      size: view.requestedSize,
    }))
  const counted = (
    <p className="text-ink-muted text-sm">
      {view.total === 0
        ? messages.search.results(0)
        : messages.search.range(view.rangeFrom, view.rangeTo, view.total)}
    </p>
  )
  /*
    The pane: the way to ask, what is narrowing the answer, and the same search
    over the other listing. It is built here rather than inside the panel
    because the panel is what a parse error leaves empty, and a reader whose
    query did not parse needs the box more than anyone.

    **The other listing's count belongs here rather than over the table.** It is
    the same search read somewhere else, so it answers "what am I asking" and
    not "what came back — over the result it read as a caption on rows it has
    nothing to do with, and it stood between the heading and the table where
    the reader had already stopped looking for controls.

    **It is the way out of this pane, so it is drawn as one** (`MoreLink`). Set
    as a sentence it was the only thing in the pane with no shape at all — no
    border like the chips above it and no weight like the dimensions below —
    and readers took it for a note rather than something to press, while the
    tab that goes to the very same address sits at the top of the screen in a
    shape nobody can mistake.

    **It is built from the same `carry` as the tab**, because it is the same
    address. Written out where each is drawn, the two drifted: the tab kept how
    many rows a page holds and this one dropped it, so switching listings from
    the pane silently put the reader back on twenty.
  */
  const other = view.otherCount === null
    ? null
    : (
        <MoreLink to={carry(swap)}>
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

    **The gaps say which of them belong together.** The count and the page links
    are one thing said twice, so they stand a third of the distance apart that
    separates the rest — at one gap for all four, the count floats between two
    controls and reads as belonging to neither.
  */
  const tools = (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
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
      <div className="flex flex-wrap items-center gap-2">
        {counted}
        <Pagination
          locale={locale}
          target={target}
          query={view.query}
          sort={view.requestedSort}
          order={view.requestedOrder}
          page={view.page}
          pageCount={view.pageCount}
          rows={view.requestedSize}
        />
      </div>
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
              to: carry("research"),
              current: target === "research",
            },
            {
              label: messages.search.tabDataset,
              to: carry("dataset"),
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
              the file would carry is the empty one, and that is the whole corpus
              rather than the search on screen. **Nothing to hand over when the
              search matched nothing either** — the file is a header row and no
              rows, which is a download that answers a question nobody asked.
            */}
            {view.parseError === null && !empty && (
              <ExportLinks locale={locale} target={target} query={view.query} sort={view.requestedSort} />
            )}
          </Heading>

          <RefinableList
            open={paneOpen}
            busy={busy}
            refineHasMore={view.conditions.length > 0 || other !== null}
            heading={(
              <PaneHeading title={messages.search.refine.heading} rule="start">
                {/*
                  **It is read at the heading's size and carries a mark
                  pointing the way it folds.** At the size the pane's other
                  asides take (12px, no glyph) it stands beside a bold heading
                  and is not found — the reader has to already know a control
                  is there.
                */}
                <button
                  type="button"
                  onClick={togglePane}
                  aria-expanded="true"
                  className="inline-flex cursor-pointer items-center gap-0.5 font-semibold text-brand text-sm"
                >
                  <Icon name="chevron-left" aria-hidden="true" />
                  {messages.search.refine.fold}
                </button>
              </PaneHeading>
            )}
            closed={(
              // **A mark and a count, and no word.** What folding gives back is
              // the pane's width, so the way into it again keeps as little of
              // that as it can — the glyph says what it opens and the number
              // says how much is in force, and the words for both are in the
              // name it announces with. **The count is not decoration**: the
              // conditions stand in the pane, so a fold naming nothing would
              // leave a reader looking at a narrowed result with nothing on
              // screen admitting to the narrowing.
              //
              // **4px rather than a circle**, for the reason the page numbers
              // beside it keep theirs (`docs/ui.md`): a glyph of 16px in a box
              // of 36 does not fill it, and a round box around something that
              // leaves that much air reads as a disc with a mark on it rather
              // than as one of the controls in the row.
              <button
                type="button"
                onClick={togglePane}
                aria-expanded="false"
                aria-label={folded}
                title={folded}
                className={`inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center gap-1 rounded px-2 hover:bg-surface-hover ${LISTING_CONTROL}`}
              >
                <Icon name="filter" aria-hidden="true" />
                {view.conditions.length > 0 && (
                  <span className="rounded-full bg-brand px-1.5 font-semibold text-white text-xs">
                    {view.conditions.length}
                  </span>
                )}
              </button>
            )}
            refine={refine}
            tools={view.parseError === null && !empty ? tools : null}
            panel={panel}
          >
            {view.parseError !== null
              ? <InvalidQuery locale={locale} column={view.parseError.column} />
              : (
                  <Stack gap="normal">
                    {children}
                    {!empty && tools}
                  </Stack>
                )}
          </RefinableList>
        </Stack>
      </Card>
    </Page>
  )
}
