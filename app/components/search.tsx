import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useSubmit } from "react-router"

import {
  BAND_FILL,
  Button,
  ButtonLink,
  Chip,
  Chooser,
  CHOOSER_SIDE,
  CLEAR,
  Heading,
  MENU_ITEM,
  MENU_ITEM_HERE,
  Note,
  PaneHeading,
  Stack,
  SwitchTabs,
} from "~/components/base"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { ConditionChip, ListShell } from "~/public/lists.server"
import { exportPath, href, listPath, searchQuery } from "~/public/urls"
import { PAGE_SIZE, PAGE_SIZES, type PageSize } from "~/search/page-size"
import type { SortKey } from "~/search/query.server"
import { defaultOrder, SORT_KEYS, type SortOrder } from "~/search/sort"

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
/** How long the typing has to stop before a listing searches for itself. */
export const SEARCH_AFTER_TYPING = 400

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
  const runSearch = useSubmit()
  const form = useRef<HTMLFormElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const waiting = useRef<number | undefined>(undefined)
  // Kana is typed as several keystrokes that are not yet a word; searching for
  // the half-written form of it answers about something nobody asked for.
  const composing = useRef(false)

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

  function searchSoon() {
    if (!searchAsTyped) return
    window.clearTimeout(waiting.current)
    waiting.current = window.setTimeout(() => {
      const fields = form.current
      if (composing.current || fields === null) return
      const asked = new FormData(fields)
      // An empty field is no condition at all, and an address is easier to read
      // and to share without the parts of it that say nothing.
      for (const [key, given] of [...asked]) if (given === "") asked.delete(key)
      void runSearch(asked, { method: "get", action, replace: true })
    }, SEARCH_AFTER_TYPING)
  }

  return (
    // The button sits inside the field rather than beside it, the way v1 draws
    // it: the two are one control, and set apart they read as a box and an
    // unrelated circle. The field keeps room for it on the right.
    <form ref={form} method="get" action={action} role="search" className="relative flex items-center">
      {children}
      <input
        ref={field}
        type="search"
        name={name}
        defaultValue={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={searchSoon}
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={() => {
          composing.current = false
          searchSoon()
        }}
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
    </form>
  )
}

export function SearchForm({
  locale,
  target,
  keyword,
  query,
  facet = null,
  find = "",
  rows = null,
  size = "normal",
  searchAsTyped = false,
}: {
  locale: Locale
  target: "research" | "dataset"
  keyword: string
  /** The conditions to keep, written out; the box does not show these. */
  query: string
  /** Which facet is open, so that searching again does not close it. */
  facet?: string | null
  find?: string
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
      label={messages.search.placeholder[target]}
      placeholder={messages.search.placeholder[target]}
      submit={messages.search.submit}
      size={size}
      searchAsTyped={searchAsTyped}
    >
      <input type="hidden" name="q" value={query} />
      {facet !== null && <input type="hidden" name="facet" value={facet} />}
      {find !== "" && <input type="hidden" name="find" value={find} />}
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
 */
export function RefinableList({ heading, refine, tools, panel, children }: {
  /** What names the pane. Its rule is the line the table's edge continues. */
  heading: React.ReactNode
  /** The box and the conditions in force. */
  refine: React.ReactNode
  /** How the result is presented, over the table it presents. */
  tools: React.ReactNode
  panel: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-x-6 md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-[auto_auto_1fr] lg:grid-cols-[16rem_minmax(0,1fr)]">
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
      <div className="pt-6 md:col-start-1 md:row-start-3">{panel}</div>
    </div>
  )
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
          variant="soft"
          size="xs"
          pill
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
      <div className="flex items-center justify-between gap-x-3 text-xs">
        <span className="font-semibold text-ink-muted">{messages.applied}</span>
        {clearHref !== null && (
          <Link to={clearHref} className={CLEAR}>{messages.clear}</Link>
        )}
      </div>
      <Stack gap="tight" as="ul">
        {conditions.map((condition) => (
          <li key={`${condition.field ?? ""}\u0000${condition.value}`}>
            <Chip
              {...(condition.field === null ? {} : { field: condition.field })}
              value={condition.value}
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
  const flip = (
    <Link
      to={href(locale, listPath(target) + searchQuery({
        q: query,
        sort,
        order: flipped === defaultOrder(sort) ? null : flipped,
        page: 1,
        size: rows,
      }))}
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
            sort: option,
            page: 1,
            size: rows,
          }))}
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
  sort: SortKey
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
  sort: SortKey
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

/**
 * What is shown when nothing matched. No relaxed search is run behind it: the
 * only honest count is of a search somebody asked for.
 *
 * **The other listing is not offered again here.** The same search over the
 * other kind of row stands in the pane, under what is narrowing this one, and
 * a screen with nothing on it saying the same thing twice within 200px reads
 * as two different offers.
 */
export function NoResults({ locale }: { locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <div className="rounded border border-line bg-surface px-6 py-6">
      <Stack gap="normal">
        <Stack gap="tight">
          <p className="font-semibold">{messages.search.none}</p>
          <p className="text-ink-muted text-sm">{messages.search.noneHint}</p>
        </Stack>
        <Stack gap="tight">
          <h2 className="font-semibold text-ink-muted text-xs">{messages.search.syntaxTitle}</h2>
          <Stack gap="tight" as="ul">
            <li className="text-ink-muted text-sm">{messages.search.syntaxSpace}</li>
            <li className="text-ink-muted text-sm">{messages.search.syntaxComma}</li>
            <li className="text-ink-muted text-sm">{messages.search.syntaxQuote}</li>
          </Stack>
        </Stack>
      </Stack>
    </div>
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
 * The file is comma-separated and opens in a spreadsheet; the copy is
 * tab-separated and goes straight into one. There is no third format — writing
 * an actual workbook would mean a dependency for a file every spreadsheet
 * already reads.
 *
 * Copying needs a browser and the address bar cannot do it, so that one is a
 * control; the file is a link, and downloads without any script at all.
 */
function ExportLinks({ locale, target, query, sort }: {
  locale: Locale
  target: "research" | "dataset"
  query: string
  sort: SortKey
}) {
  const messages = messagesFor(locale)
  const [copied, setCopied] = useState(false)
  const at = (format: "copy" | "csv") =>
    `${href(locale, exportPath(target))}?${new URLSearchParams({ format, q: query, sort }).toString()}`

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
        pill
        icon={<Icon name="copy" />}
        onClick={() => { void copy() }}
      >
        {copied ? messages.search.exportCopied : messages.search.exportCopy}
      </Button>
      <ButtonLink to={at("csv")} external pill icon={<Icon name="download" />}>
        {messages.search.exportCsv}
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
export function ListingScreen({ view, target, heading, panel, other, empty, children }: {
  view: ListShell
  target: "research" | "dataset"
  /** What this listing is called, which is also where the trail ends. */
  heading: string
  panel: ReactNode
  /** The same search over the other listing, when there is anything there. */
  other?: ReactNode
  /** Whether the table below has any rows at all. */
  empty: boolean
  children: ReactNode
}) {
  const locale = view.locale
  const messages = messagesFor(locale)
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
    The pane: the way to ask, what is narrowing the answer, and the same words
    over the other listing. It is built here rather than inside the panel
    because the panel is what a parse error leaves empty, and a reader whose
    query did not parse needs the box more than anyone.

    **The other listing's count belongs here rather than over the table.** It is
    the same search read somewhere else, so it answers "what am I asking" and
    not "what came back — over the result it read as a caption on rows it has
    nothing to do with, and it stood between the heading and the table where
    the reader had already stopped looking for controls.
  */
  const refine = (
    <Stack gap="normal">
      <SearchForm
        locale={locale}
        target={target}
        keyword={view.keyword}
        query={view.query}
        facet={view.facet}
        find={view.find}
        rows={view.requestedSize}
        size="compact"
        searchAsTyped
      />
      <AppliedConditions
        locale={locale}
        conditions={view.conditions}
        clearHref={view.clearHref}
      />
      {other !== undefined && <p className="text-sm">{other}</p>}
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
        sort={view.sort}
        order={view.requestedOrder}
        size={view.size}
      />
      <div className="flex flex-wrap items-center gap-2">
        {counted}
        <Pagination
          locale={locale}
          target={target}
          query={view.query}
          sort={view.sort}
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
              rather than the search on screen.
            */}
            {view.parseError === null && (
              <ExportLinks locale={locale} target={target} query={view.query} sort={view.sort} />
            )}
          </Heading>

          <RefinableList
            heading={<PaneHeading title={messages.search.refine.heading} rule="start" />}
            refine={refine}
            tools={view.parseError === null && !empty ? tools : null}
            panel={panel}
          >
            {view.parseError !== null
              ? <InvalidQuery locale={locale} column={view.parseError.column} />
              : empty
                ? <NoResults locale={locale} />
                : (
                    <Stack gap="normal">
                      {children}
                      {tools}
                    </Stack>
                  )}
          </RefinableList>
        </Stack>
      </Card>
    </Page>
  )
}
