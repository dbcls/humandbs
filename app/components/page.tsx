import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"

import { Badge, Band, BAND_FILL, type BandTone, Breadcrumb, LISTING_CONTROL, Note, Stack } from "~/components/base"
import { Icon, type IconName } from "~/components/icons"
import { linkHref } from "~/content/richtext"
import type { RichText, Span } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import type { FieldView, LinksView, TermView } from "~/public/view.server"

/**
 * What a preview hangs beside a place the page draws — a comment mark, a note
 * that the published version says something else.
 *
 * A page marks its places by putting `<Annotation at="…" />` where the mark
 * belongs, and the anchor it names is the same path a comment is attached by
 * and the diff reports. **A public page provides nothing**, so `annotate` is
 * absent, every mark renders as nothing, and the published page is drawn by the
 * same code that draws the preview.
 */
export type Annotate = (at: string) => ReactNode

const AnnotateContext = createContext<Annotate | null>(null)

export function AnnotationLayer({ annotate, children }: {
  annotate: Annotate
  children: ReactNode
}) {
  return <AnnotateContext.Provider value={annotate}>{children}</AnnotateContext.Provider>
}

export function Annotation({ at }: { at: string }) {
  const annotate = useContext(AnnotateContext)
  return annotate === null ? null : <>{annotate(at)}</>
}

/**
 * The area a screen draws in.
 *
 * **An article asks for the narrower measure.** A page that is mostly prose — a
 * guideline, a news item, the four pages the code holds — is held to the reading
 * width, which is what v1 does with the same two numbers (`app.css`).
 *
 * **A listing takes the window.** Its twelve columns ask 1,919px between them
 * and the panel beside them takes 376 more, so no measure the site could name
 * holds them on the screens people read this on — one would only be the width
 * at which the sideways scroll stops, which is past every window in use. Given
 * the window, the columns have as much as there is and the reader scrolls for
 * the rest. The management area takes it for a different reason: it has no
 * measure that would be right on every one of its screens.
 */
export type PageWidth = "wide" | "reading" | "full"

const PAGE_WIDTH: Record<PageWidth, string> = {
  wide: "max-w-content-max",
  reading: "max-w-content-narrow",
  full: "max-w-none",
}

const PageWidthContext = createContext<PageWidth | null>(null)

/**
 * The measure the screens under it take unless they ask for another.
 *
 * **It exists for the management area**, where the answer is the same on every
 * screen and is a property of the area rather than of any one of them: the
 * shell sets it once, and a screen added later is held to the window without
 * having to know that. A screen that names a width still wins, which is how a
 * reading measure stays available anywhere.
 */
export function PageWidthDefault({ width, children }: {
  width: PageWidth
  children: ReactNode
}) {
  return <PageWidthContext.Provider value={width}>{children}</PageWidthContext.Provider>
}

export function Page({ width, children }: {
  width?: PageWidth
  children: ReactNode
}) {
  const fallback = useContext(PageWidthContext) ?? "wide"
  // The target of the skip link in the header, on every page that has one.
  return (
    <main
      id="content"
      className={`mx-auto w-full px-4 py-4 sm:px-page-gutter ${PAGE_WIDTH[width ?? fallback]}`}
    >
      {children}
    </main>
  )
}

/**
 * Where the page sits, said above it.
 *
 * The front page is always the first step and is added here rather than by
 * every screen, so a trail is written as what lies between the front page and
 * this one. It sits on the tint above the white box, which is where v1 puts it.
 * The front page itself has none: it is the root, and a trail of one step
 * naming the page you are on says nothing.
 */
export function Crumbs({ locale, trail = [], current }: {
  locale: Locale
  trail?: { label: string, to: string }[]
  current: string
}) {
  const messages = messagesFor(locale)
  return (
    <div className="mb-2">
      <Breadcrumb
        label={messages.breadcrumb}
        trail={[{ label: messages.homeLabel, to: href(locale, "/") }, ...trail]}
        current={current}
      />
    </div>
  )
}

/**
 * The band a page opens with, and what sits next to it.
 *
 * **Only a page about one thing that has a name of its own gets one** — a
 * research, a dataset, a draft (`base.tsx` の `Band`). A listing or an article
 * opens with `Heading` instead. The subject's own label goes above the name it
 * is known by, the way v1 puts "NBDC Research ID:" over `hum0103-v4`.
 */
export function PageHead({ tone = "deep", kicker, label, children }: {
  tone?: BandTone
  /** What kind of name this is, said small above it. */
  kicker?: string
  label: ReactNode
  children?: ReactNode
}) {
  return (
    <Band tone={tone} className="rounded-t">
      <div>
        {kicker !== undefined && <p className="text-white/80 text-xs">{kicker}</p>}
        <h1 className="flex flex-wrap items-center gap-3 font-bold text-xl">{label}</h1>
      </div>
      {children !== undefined && (
        <div className="flex flex-wrap items-center gap-3 text-sm">{children}</div>
      )}
    </Band>
  )
}

/**
 * The white box a screen puts its content in.
 *
 * No border and no shadow: the page sits on a tint, so the edge of the box is
 * where the tint stops. `under` squares off the top, for a box that follows a
 * band and is one thing with it.
 */
export function Card({ under = true, children }: {
  under?: boolean
  children: ReactNode
}) {
  return (
    <div className={`bg-white px-6 py-6 ${under ? "rounded-b" : "rounded"}`}>
      {children}
    </div>
  )
}

/**
 * A part of a page, named. No rule under it — the space is the separation.
 *
 * The distance to whatever is above is the `Stack` these sit in rather than a
 * margin of their own: two rules for one gap is how a page ends up with an
 * uneven one.
 */
export function Section({ title, at, children }: {
  title: string
  /** The anchor of the whole section, when it draws one field. */
  at?: string
  children: ReactNode
}) {
  return (
    <Stack gap="tight" as="section">
      {/* A mark for the whole section sits beside its name rather than under
          it: on a line of its own it reads as belonging to the first value. */}
      <h2 className="flex flex-wrap items-center gap-2 border-brand border-l-4 pl-2.5 font-medium text-brand text-lg">
        {title}
        {at !== undefined && <Annotation at={at} />}
      </h2>
      {children}
    </Stack>
  )
}

/**
 * One labelled value.
 *
 * **The pairs are flowed into columns rather than laid on a grid.** Two cells on
 * a grid row are both as tall as the taller one, and these values differ by a
 * factor of three or more — a summary of aims, methods and participants left 44%
 * of its box empty and stood 638px, against 11% and 398px flowed. A column is
 * also why they are not simply set full width: the page is 1,344px across, which
 * is eighty Japanese characters to a line.
 *
 * **No value is broken across the two columns.** Split at the foot of one, a
 * sentence continued at the head of the other reads as a second answer.
 *
 * **A rule goes between two pairs and nowhere else.** Drawn under each one, the
 * last in a column closes against nothing — inside a box it floats a few pixels
 * above that box's own edge, and at the foot of a flowed column it lands
 * wherever the balance happened to fall. Drawn over each one, the same is true
 * at the head of a column.
 *
 * **Neither end can be named in CSS**: `:first-child` and `:last-child` are the
 * ends of the source, not of a column, and which pair a column begins with is
 * decided after layout. So the rule is drawn over every pair and the two that
 * land at the top of a column are put out of the box instead: each pair is
 * shifted up by exactly the width of its own rule, which leaves the rules in
 * the middle where they were and takes the first one in each column to -1px,
 * outside what the list clips. **The shift is `top` rather than a margin** — a
 * margin at the head of a column is dropped by the fragmentation, which is
 * precisely the case that has to move.
 *
 * **The rule belongs here rather than to `KeyValue`.** A pair that is the only
 * one in its box has nothing to be separated from — the release list sets two
 * of them side by side, where what divides them is the gap between the columns.
 */
export function Pairs({ children }: { children: ReactNode }) {
  return (
    <dl className="gap-x-8 overflow-hidden sm:columns-2 [&>*]:-top-px [&>*]:relative [&>*]:border-line [&>*]:border-t">
      {children}
    </dl>
  )
}

export function KeyValue({ title, at, children }: {
  title: string
  /** The anchor of the value below, when the page has one for it. */
  at?: string
  children: ReactNode
}) {
  return (
    <div className="break-inside-avoid py-2">
      <Stack gap="tight">
        <dt className="text-ink-muted text-xs">{title}</dt>
        <dd>
          {children}
          {at !== undefined && <Annotation at={at} />}
        </dd>
      </Stack>
    </div>
  )
}

/**
 * Where a column that stays put comes to rest when the table is scrolled
 * sideways, and how wide it is.
 *
 * **The width is fixed here rather than left to the contents**, because the
 * second column can only know where to begin if the first one is a known size.
 * **Two is as many as this is worth**: what a reader loses first when a dozen
 * columns run off the side is which row they are reading, and the mark and the
 * label are the two that say it.
 *
 * **A frozen cell carries the band's own start rather than the band's
 * gradient.** The fill runs the width of the row, so a cell that asked for it
 * again would run the whole of it inside sixty pixels and start over at its
 * edge. At the left end of the row, where these two stand, a flat fill and the
 * gradient's first tenth are the same colour.
 */
/**
 * The width of a column holding a mark and nothing else.
 *
 * **The mark is `size-tap` and the cell's padding sits either side of it, so
 * the column has one width** — but a table narrower than its box shares what it
 * has over among the columns that name none, and this column would take a share
 * of it. The two listings would then draw the same mark in columns of different
 * widths, which is what happened: 60px beside 74px.
 */
const MARK_COLUMN = "w-15"

const STUCK = [
  `sticky left-0 z-10 ${MARK_COLUMN}`,
  "sticky left-15 z-10 w-26",
]

/**
 * The shading on an edge the table can still travel towards.
 *
 * **A table wider than its box is the only thing on a public page that scrolls
 * inside itself, and nothing on the screen says so.** The bar claims no width,
 * and the box is twice as tall as the window, so even a bar that claimed some
 * would sit below everything the reader can see. So the box says it, and says
 * it before being touched: the far edge is shaded from the moment the page
 * opens, and the shading goes when there is nothing left that way.
 *
 * **A shadow rather than a fade to the page behind.** The same strip crosses
 * the coloured band and the white rows under it, and a shadow is the one
 * drawing that means the same thing on both.
 */
const EDGE_SHADE = "pointer-events-none absolute inset-y-0 w-4"

/**
 * What the near edge looks like when a frozen column is standing at it.
 *
 * What stays and what slides are the same colour, so without this the sentence
 * passing behind reads as the continuation of the cell that stayed — a row that
 * says `hum0358` and then half a word of something else. **It is drawn only
 * while the table is away from its start**: with nothing sliding past there is
 * nothing to tell apart, and a rule that is there either way is one the reader
 * has to explain to themselves.
 */
const FROZEN_EDGE = "shadow-[6px_0_6px_-6px_rgba(0,34,69,0.45)]"

/** Which frozen column is carrying that edge, or -1 while none is. */
const FrozenEdgeAt = createContext(-1)

/**
 * A table.
 *
 * **A header is anything, not a string.** A column whose header is a control —
 * the checkbox that selects every file, a sort link — cannot be written
 * otherwise, and a table that took only strings pushed those columns into
 * having no header at all.
 *
 * **The table is allowed to be wider than the page** and scrolls inside its own
 * box. A cell has a floor as well as a ceiling: without the floor a narrow
 * screen squeezes a column of titles down to one character per line rather than
 * letting the table overflow, and without the ceiling one long summary makes
 * every other column unreadably narrow.
 */
export function Table({ headers, children, stuck = 0 }: {
  headers: ReactNode[]
  children: ReactNode
  /** How many of the leading columns stay put when the table scrolls sideways. */
  stuck?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const [reach, setReach] = useState({ back: false, on: false })

  // Both ends are read from the same event, and the state only changes when one
  // of them crosses: a table this wide holds a hundred cells, and re-drawing
  // them on every pixel of a drag is what makes a scroll feel heavy.
  const measure = useCallback(() => {
    const el = box.current
    if (el === null) return
    const room = el.scrollWidth - el.clientWidth
    setReach((was) => {
      const back = el.scrollLeft > 1
      const on = el.scrollLeft < room - 1
      return was.back === back && was.on === on ? was : { back, on }
    })
  }, [])

  // A window that grows can leave a table with nothing to travel towards, so
  // the far edge is watched as well as the scroll.
  useEffect(() => {
    const el = box.current
    if (el === null) return
    measure()
    const watch = new ResizeObserver(() => {
      measure()
    })
    watch.observe(el)
    return () => {
      watch.disconnect()
    }
  }, [measure])

  const edgeAt = reach.back ? stuck - 1 : -1

  return (
    <div className="relative">
      <div ref={box} className="overflow-x-auto" onScroll={measure}>
        {/*
          **Separate borders rather than collapsed ones.** A collapsed table
          paints its cell boxes as part of the table's own background, and a
          shadow asked for on a cell never appears — which is what the frozen
          column needs to draw its edge with. With no spacing between them the
          two draw the same rules.
        */}
        <table className="min-w-full table-auto border-separate border-spacing-0 text-sm">
          <thead>
            {/*
              **The band finishes its sweep inside the box, not inside the
              table.** A gradient laid across the whole table spends a third of
              its travel past the right edge of what the reader can see, so the
              part they do see covers 1.46x in luminance where the whole covers
              1.77x — the band reads as flatter than it is. Ending it at about
              the width the box has on the display the portal is read on gives
              the whole sweep to the first screenful; scrolling sideways runs
              along the light end, which is where the sweep was going anyway.

              **It belongs here rather than in `BAND_FILL`.** A band elsewhere
              is as wide as its box already, and the filled circles that take
              the same fill are 28px across — stopping their sweep at 1200px
              would leave them flat at the dark end.
            */}
            <tr className={`text-left text-white ${BAND_FILL.brand} to-[1200px]`}>
              {/*
                A header asks for no width of its own: what a column needs is
                decided by the cells under it, and a header that claimed a floor
                would widen a column of marks to the width of the word above it.
              */}
              {/*
                **A header that is a control keeps no room of its own.** A mark
                is 36px against a line of 22.4px, so the padding a word needs
                would make the band half as tall again — which is what made the
                two listings, drawn from the same frame, open with bands of two
                different heights.
              */}
              {headers.map((header, index) => (
                <th
                  key={index}
                  className={`max-w-88 px-3 font-semibold ${typeof header === "string" ? "py-1.5" : `${MARK_COLUMN} py-0`} ${index < stuck ? `${STUCK[index] ?? ""} bg-brand-dark ${index === edgeAt ? FROZEN_EDGE : ""}` : ""}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <FrozenEdgeAt.Provider value={edgeAt}>{children}</FrozenEdgeAt.Provider>
          </tbody>
        </table>
      </div>
      {/* With a frozen column the near edge is that column's own shadow, so the
          strip is only drawn where there is nothing standing at it. */}
      {reach.back && stuck === 0 && (
        <div className={`${EDGE_SHADE} left-0 bg-linear-to-r from-deep/20 to-transparent`} />
      )}
      {reach.on && (
        <div className={`${EDGE_SHADE} right-0 bg-linear-to-l from-deep/20 to-transparent`} />
      )}
    </div>
  )
}

export function Td({ children, nowrap = false, narrow = false, stuck, colSpan, floor, className = "" }: {
  children?: ReactNode
  /** For a cell holding an identifier, which must not be broken to fit. */
  nowrap?: boolean
  /**
   * For a cell holding a mark rather than a value.
   *
   * It needs no floor, and **it keeps no room above and below**: a mark is
   * `size-tap` (36px) against a line of 22.4px, so a cell that padded it would
   * make the row half as tall again and leave the mark sitting seven pixels
   * below the words beside it. Without the padding the row is as tall as its
   * text and the mark rides inside it, at the size a finger still finds.
   */
  narrow?: boolean
  /**
   * Which of the table's stuck columns this cell is, when the table has any.
   * A cell that stays put carries the card's own colour: the ones it slides
   * over would otherwise read through it.
   */
  stuck?: number
  /** For a row that says one thing across several columns. */
  colSpan?: number
  /**
   * How narrow this column may become, as a whole `min-w-*` class, where the
   * default floor is the wrong one for it.
   *
   * **A column's floor is written in one place.** A cell that put a second
   * `min-w-*` beside the default would leave two rules of equal weight to be
   * settled by whichever Tailwind happened to emit last, so a class added that
   * way widens a column but silently fails to narrow one.
   *
   * **A frozen column has none**: its width is fixed in `STUCK`, and a floor
   * beside it would raise the column above the width the next one starts at.
   */
  floor?: string
  className?: string
}) {
  const edgeAt = useContext(FrozenEdgeAt)
  return (
    <td
      colSpan={colSpan}
      className={`max-w-88 border-line border-b px-3 align-top ${narrow ? `${MARK_COLUMN} py-0` : `${floor ?? (stuck === undefined ? "min-w-28" : "")} py-1.5`} ${nowrap ? "whitespace-nowrap" : ""} ${stuck === undefined ? "" : `${STUCK[stuck] ?? ""} bg-white ${stuck === edgeAt ? FROZEN_EDGE : ""}`} ${className}`}
    >
      {children}
    </td>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-ink-muted text-sm">{children}</p>
}

/**
 * Page links, given a way to address a page.
 *
 * **The cut is always made on the server**, both for search results and for a
 * box of ten thousand files, so what a reader gets is a link rather than a
 * script — and one address for one page, which can be shared.
 */
/**
 * A page number is a two-character target. Without a box around it the thing to
 * press is the glyph itself, which is a tenth of the area of anything else on
 * the page that can be pressed — so each number sits in one, and the page being
 * read is the one that is filled in.
 *
 * **It takes the face and the edge every control over a listing takes**
 * (`base.tsx` の `LISTING_CONTROL`) **but not its corner.** The numbers stand in
 * the same row as the ordering, how many rows a page holds and the export, and
 * a row of controls in three faces reads as three unrelated facilities — the
 * edge also settles one that was under the requirement, `line` on white coming
 * to 2.09:1 against the 3:1 the site asks of anything you can operate.
 *
 * **The corner is 4px because the box is not full of anything.** A digit is
 * 7.8px inside 36px — the box is 4.6 times the width of what it holds, and
 * there are nine of them in a row. Rounded off, the vertical edges go and with
 * them the sense of a strip of cells: what is left is a chain of rings with a
 * mark in each, and the eye has nothing to count along. The other controls are
 * filled by their own words, so a round end there reads as the end of a word.
 */
const PAGE_BOX = "inline-flex min-h-tap min-w-tap items-center justify-center rounded px-2"
const PAGE_STEP = `${PAGE_BOX} ${LISTING_CONTROL} hover:bg-surface-hover`
const PAGE_HERE = `${PAGE_BOX} border border-transparent bg-brand font-semibold text-white`

/** How many pages either side are offered one by one, before the steps double. */
const NEAREST = 3

/**
 * Which pages to offer, on a logarithmic scale: a few either side, then steps
 * that double — 1, 2, 3, 7, 15, 31, 63 … — out to the two ends, which are
 * always offered.
 *
 * **Every page is then a few presses from every other.** A fixed window around
 * the current page leaves the middle of a long listing reachable only by
 * pressing "next" over and over or by starting again from an end. Measured as
 * the worst case over every pair of pages, with the 34 pages of announcements:
 * a window needs 9 presses and this needs 3. At 50 pages it is 13 against 3,
 * and at 1,283 it is 321 against 6 — the count of links grows with the
 * logarithm of the page count, so it stays around a dozen while the listing
 * does not.
 *
 * `most` caps how many numbers are drawn, for a listing sitting somewhere too
 * narrow to hold them. **The nearest pages are given up first and the doubling
 * steps are never dropped**: the steps are what bounds the presses, and a
 * neighbour is also one press on "next".
 *
 * **No ellipsis between the numbers.** At this scale almost every neighbouring
 * pair is non-consecutive, so the marks would outnumber the pages; the gaps in
 * the numbers themselves say the same thing.
 */
export function pageWindow(page: number, pageCount: number, most = Infinity): number[] {
  if (pageCount < 1) return []
  // A page outside the listing is one the reader asked for and does not exist;
  // it stands in for the nearest one that does rather than being offered.
  const at = Math.min(Math.max(page, 1), pageCount)
  for (let nearest = NEAREST; nearest > 1; nearest--) {
    const offered = offeredPages(at, pageCount, nearest)
    if (offered.length <= most) return offered
  }
  return offeredPages(at, pageCount, 1)
}

function offeredPages(page: number, pageCount: number, nearest: number): number[] {
  const offered = new Set([1, page, pageCount])
  const add = (n: number) => {
    if (n > 1 && n < pageCount) offered.add(n)
  }
  for (let near = 1; near <= nearest; near++) {
    add(page - near)
    add(page + near)
  }
  for (let step = 2 * NEAREST + 1; step < pageCount; step = step * 2 + 1) {
    add(page - step)
    add(page + step)
  }
  return [...offered].sort((a, b) => a - b)
}

export function PageLinks({ label, page, pageCount, at, previous, next, most }: {
  label: string
  page: number
  pageCount: number
  at: (page: number) => string
  previous: string
  next: string
  /** At most this many page numbers, where the room for them is short. */
  most?: number
}) {
  if (pageCount <= 1) return null

  // The two steps are drawn as arrows rather than words: they sit in a row of
  // numbers, and a word among them is read as one more place to go rather than
  // as the way to the place beside this one. The words stay as their names.
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1 text-sm">
      {page > 1 && (
        <Link to={at(page - 1)} aria-label={previous} title={previous} className={PAGE_STEP}>
          <Icon name="chevron-left" />
        </Link>
      )}
      {pageWindow(page, pageCount, most).map((number) => (
        number === page
          ? (
              <span key={number} className={PAGE_HERE} aria-current="page">
                {number}
              </span>
            )
          : <Link key={number} to={at(number)} className={PAGE_STEP}>{number}</Link>
      ))}
      {page < pageCount && (
        <Link to={at(page + 1)} aria-label={next} title={next} className={PAGE_STEP}>
          <Icon name="chevron-right" />
        </Link>
      )}
    </nav>
  )
}

/**
 * A run of prose. A span is a link only if its destination is one the page may
 * follow — everything else keeps its text and loses the link, so a `javascript:`
 * URL written into a value cannot become an anchor on the portal's own origin.
 * This is the last of the two checks; the save path is the other.
 */
function SpanText({ span }: { span: Span }) {
  const href = span.href === undefined ? null : linkHref(span.href)
  // Underlined: this is the one place on a research page where a link is a
  // few words inside a sentence rather than a line of its own (`app.css`).
  return href === null ? <>{span.text}</> : <a href={href} className="underline">{span.text}</a>
}

/** Lines of spans, and nothing else — the whole of what prose can hold. */
function Prose({ text }: { text: RichText }) {
  return (
    <>
      {text.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {line.map((span, spanIndex) => <SpanText key={spanIndex} span={span} />)}
        </Fragment>
      ))}
    </>
  )
}

/**
 * One resolved value. `not-applicable` is settled information, so it is shown
 * as a value rather than hidden — an empty value and "there is no such value"
 * are different answers, and only one of them means somebody still has to act.
 *
 * `unsettled` only ever arrives from a preview, and it is drawn as the empty
 * frame it is: the question is what the reader is being shown, and a blank
 * would look like a value nobody thought worth filling in.
 */
export function Value({ field, locale }: { field: FieldView, locale: Locale }) {
  if (field.state === "not-applicable") {
    return <span className="text-ink-muted italic">{messagesFor(locale).notApplicable}</span>
  }
  if (field.state === "unsettled") {
    return <Badge tone="accent" dashed>{messagesFor(locale).unsettled}</Badge>
  }
  if (field.state === "rich") {
    return field.text.length === 0 ? null : <Prose text={field.text} />
  }
  return field.text === "" ? null : <>{field.text}</>
}

/**
 * The same four states for a value that is a list of links. A URL never falls
 * back between languages, but it is marked unsettled and not applicable like
 * anything else, and a preview is where those two have to stay visible.
 */
/** Whether a links value has anything to draw, state included. */
export function hasLinks(links: LinksView): boolean {
  return links.state !== "value" || links.value.length > 0
}

export function LinksValue({ links, locale, linked = true }: {
  links: LinksView
  locale: Locale
  /** A preview shows a private file's address as text; everywhere else it is a link. */
  linked?: boolean
}) {
  if (links.state !== "value") return <Value field={links} locale={locale} />
  if (links.value.length === 0) return null
  return (
    <ul>
      {links.value.map((link) => (
        <li key={link.id} className="break-all">
          {linked
            ? (
                <ExternalLink to={link.url} locale={locale}>
                  {link.text === "" ? link.url : link.text}
                </ExternalLink>
              )
            : (link.text === "" ? link.url : link.text)}
        </li>
      ))}
    </ul>
  )
}

/**
 * A way out of the portal.
 *
 * **The mark is part of the link, not decoration beside it.** A tab that opens
 * without warning leaves the reader pressing a back button that does nothing,
 * so the icon travels inside the anchor and a word says the same thing for
 * anyone who is not looking at it. `noopener` is what keeps the page that is
 * opened from reaching back into this one.
 */
export function ExternalLink({ to, locale, children }: {
  to: string
  locale: Locale
  children: ReactNode
}) {
  return (
    <a
      href={to}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1"
    >
      {children}
      <Icon name="external" />
      <span className="sr-only">{messagesFor(locale).newTab}</span>
    </a>
  )
}

/**
 * Shown once for the whole page rather than beside each value: a page whose
 * language was never filled in has every field falling back, and a badge on
 * each of them would say the same thing dozens of times.
 */
export function UntranslatedNotice({ show, locale }: { show: boolean, locale: Locale }) {
  if (!show) return null
  return <Note kind="tip">{messagesFor(locale).untranslatedNotice}</Note>
}

/**
 * A vocabulary value, with the maker set apart from the rest where the value
 * names a product.
 *
 * **The maker takes the link colour and a step of space.** A column of machines
 * is read as "whose" and then "which", and written as one string the reader has
 * to find that boundary again on every row; the previous portal drew the same
 * two parts the same way. **The colour is borrowed, not the meaning** — the
 * value is not a link, and nothing here is pressable.
 *
 * **In the refinement panel only the space does the work.** The whole value is
 * a link there, so a maker in the link's own colour is the same colour as the
 * rest — and no colour is better: against the brand the quietest ink the
 * palette has still only reaches 1.2:1, where against body text the brand
 * reaches 2.4. One drawing is kept rather than two, and where the colour
 * cannot separate the words the gap does.
 *
 * A value with no maker, or one whose label no longer begins with it, is drawn
 * whole (`app/public/view.server.ts`).
 */
export function TermLabel({ term }: { term: { label: string, maker: string | null } }) {
  if (term.maker === null) return <>{term.label}</>
  return (
    <>
      {/*
        **The space is a character, not a margin.** What is copied out of the
        cell and what a screen reader says are both the text, and drawing the
        gap alone leaves them holding `IlluminaMiSeq`. The margin is a step on
        top of it, so the eye sees two things where the text says two words.
      */}
      <span className="mr-1 text-brand">{term.maker}</span>
      {" "}
      {term.label.slice(term.maker.length).trim()}
    </>
  )
}

/**
 * How a dataset may be used, which is the one thing a reader scanning a listing
 * is looking for.
 *
 * **A lock and the words, not a badge.** The restriction is a property of the
 * dataset rather than a state it is passing through, and forty outlined boxes
 * down a listing read as decoration.
 *
 * **Both kinds carry a lock, and the two locks differ.** A shut one in the
 * colour reserved for what must be noticed says an application stands between
 * the reader and the data; an open one in the link colour says it does not.
 * Marking only the restricted kind leaves the other saying nothing at all,
 * which in a column read at a glance is indistinguishable from a row whose
 * value is missing.
 */
const LOCK: Record<string, { name: IconName, className: string }> = {
  "controlled-access-type-1": { name: "lock", className: "text-accent" },
  "controlled-access-type-2": { name: "lock", className: "text-accent" },
  "unrestricted-access": { name: "lock-open", className: "text-brand" },
}

export function AccessTypeBadge({ term }: { term: TermView }) {
  const lock = LOCK[term.code]
  return (
    // **The box is set against the top of the line, not its baseline.** An
    // inline box as tall as the line it sits in hangs below it when it is
    // aligned by baseline, and every row holding one grew by that overhang —
    // which is the rule that a row's height is decided by its text, broken.
    <span className="inline-flex items-center gap-1.5 align-top text-nowrap">
      {lock !== undefined && <Icon name={lock.name} className={lock.className} />}
      {term.label}
    </span>
  )
}
