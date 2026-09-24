import { Children, createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"

import { Badge, Band, BAND_FILL, type BandTone, Breadcrumb, Clamped, EDGE_SHADE, LISTING_CONTROL, Note, Stack, Chevron } from "~/components/base"
import { Icon, type IconName, SUBJECT_ICON } from "~/components/icons"
import { linkHref } from "~/content/richtext"
import type { RichText, Span } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import type { FieldView, LinksView, TermView } from "~/public/view.server"

import { scrollPaneTo } from "./scroll"

/**
 * What a preview hangs beside a place the page draws — a comment mark, a note
 * that the published version says something else.
 *
 * A page marks its places by putting `<Annotation at="…" />` beside each
 * place's name, and the anchor it names is the same path a comment is
 * attached by and the diff reports. **A public page provides nothing**, so
 * `annotate` is absent, every mark renders as nothing, and the published page
 * is drawn by the same code that draws the preview.
 *
 * **Every mark stands with the name** — beside a section's heading, beside a
 * pair's name, at the value's right in a cell that has no name of its own —
 * where the form beside the page stands its own marks, and where a reader looks
 * to see what a thing is called. Under the value, a mark read as belonging to
 * whatever came next.
 */
/**
 * What hangs beside one place, given the place and the name the page gives it
 * — the heading, the pair's name, the column's — so that a panel opened from a
 * mark can say which place it is about in the words the reader is looking at.
 */
export type Annotate = (at: string, name?: string) => ReactNode

interface AnnotationLayerValue {
  annotate: Annotate
  /** The place the caret is in, on the form this page is drawn beside. */
  here: string | null
  /** The way into the field writing a place, when the page stands beside its form. */
  onGo: ((at: string) => void) | null
  /** What that way is called, for whoever reaches it by keyboard. */
  goLabel: string
}

const AnnotateContext = createContext<AnnotationLayerValue | null>(null)

export function AnnotationLayer({ annotate, here = null, onGo = null, goLabel = "", children }: {
  annotate: Annotate
  here?: string | null
  onGo?: ((at: string) => void) | null
  goLabel?: string
  children: ReactNode
}) {
  const value = useMemo<AnnotationLayerValue>(
    () => ({ annotate, here, onGo, goLabel }),
    [annotate, here, onGo, goLabel],
  )
  return <AnnotateContext.Provider value={value}>{children}</AnnotateContext.Provider>
}

export function Annotation({ at, name }: { at: string, name?: string }) {
  const layer = useContext(AnnotateContext)
  return layer === null ? null : <>{layer.annotate(at, name)}</>
}

/**
 * A place with its mark beside it, for a cell that has no name of its own —
 * the name is the column's heading, and a mark under the value read as
 * belonging to the row below. The mark stands at the value's right on its
 * first line.
 */
export function MarkedPlace({ at, name, children }: {
  at: string
  /** The column's heading, which is this cell's name. */
  name: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1"><Place at={at}>{children}</Place></div>
      <Annotation at={at} name={name} />
    </div>
  )
}

/**
 * A place's value, as the page draws it, so the form beside the page can point
 * at it.
 *
 * **What says "this is the value you are writing" is the value itself.** While
 * the caret is in the field writing this place, the value is tinted and brought
 * to the middle of the pane; a mark beside the heading was a 36px point that
 * left the paragraph being written looking like every other, and the two panes
 * read as unrelated (`docs/editing.md` の「フォームの隣に立つ公開ページ」).
 *
 * **Pressing the value goes to its field.** Nothing is written here — a second
 * box for the same value would leave two answers to what is written — and the
 * links inside a value keep their own press. The same way is a button for the
 * keyboard, shown only while it holds focus.
 *
 * **A public page has no layer**, and this draws the value and nothing else.
 */
export function Place({ at, onBand = false, children }: {
  at: string
  /**
   * Standing on a coloured band — an experiment's name. **The ground that
   * marks the caret's place is the band's own white, not the page's tint**:
   * the tint under white words leaves the words unreadable at the one moment
   * they are being pointed at.
   */
  onBand?: boolean
  children: ReactNode
}) {
  const layer = useContext(AnnotateContext)
  const box = useRef<HTMLDivElement>(null)
  const here = layer !== null && layer.here === at
  useEffect(() => {
    // Only the pane moves (`scroll.ts`): the caret is in the form beside this
    // pane, and the window it stands in is where the reader left it.
    if (here && box.current !== null) scrollPaneTo(box.current, "center")
  }, [here])
  if (layer === null) return <>{children}</>
  const go = layer.onGo
  return (
    <div
      ref={box}
      data-place={at}
      // **At least a line tall.** A field just added to the form has nothing
      // written yet, and a place with nothing in it is no height at all — the
      // caret in its box would light nothing here, and there would be nothing
      // to press to go back to it.
      className={`-mx-2 min-h-[1lh] rounded px-2 transition-colors ${here ? (onBand ? "bg-white/20" : "bg-surface-hover") : ""} ${
        go === null ? "" : "cursor-pointer"
      }`}
      onClick={go === null
        ? undefined
        : (event) => {
            const pressed = event.target instanceof Element ? event.target : null
            if (pressed?.closest("a, button, summary, details, input, textarea, select") !== null) return
            // **The innermost place answers, and only it.** A section is a
            // place holding places (a list's table holds its cells), and a
            // press left to rise would go on to the section's own field and
            // take the form away from the row it had just landed on.
            event.stopPropagation()
            go(at)
          }}
    >
      {children}
      {go !== null && (
        <button
          type="button"
          className="sr-only focus:not-sr-only focus:mt-1 focus:inline-block focus:text-brand focus:text-xs"
          onClick={(event) => {
            event.stopPropagation()
            go(at)
          }}
        >
          {layer.goLabel}
        </button>
      )}
    </div>
  )
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
export function PageHead({ tone = "deep", level = "h1", kicker, label, children }: {
  tone?: BandTone
  /**
   * The step the name takes.
   *
   * **A band drawn inside another screen is not that screen's name.** The pane
   * beside an editor's form carries the published page whole, band and all —
   * left at `h1` the screen has two names, and the first one a reader is handed
   * is an identifier rather than what the screen is for.
   */
  level?: "h1" | "p"
  /** What kind of name this is, said small above it. */
  kicker?: string
  label: ReactNode
  children?: ReactNode
}) {
  const Name = level
  return (
    <Band tone={tone} className="rounded-t">
      <div>
        {kicker !== undefined && <p className="text-white/80 text-xs">{kicker}</p>}
        <Name className="flex flex-wrap items-center gap-3 font-bold text-xl">{label}</Name>
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
export function Card({ under = true, fill = false, children }: {
  under?: boolean
  /**
   * Stand exactly as tall as the box this is in and hand the room down as a
   * column (`base.tsx` の `Stack` の `fill`) — for a pane whose one long field
   * is to scroll on its own rather than carry the pane's length. When the
   * window is too low for the column's floors, what does not fit runs past
   * this box and the pane scrolls it.
   */
  fill?: boolean
  children: ReactNode
}) {
  return (
    <div className={`bg-white px-6 py-6 ${under ? "rounded-b" : "rounded"}${fill ? " flex h-full flex-col" : ""}`}>
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
 *
 * **The name stands at `normal` above what it names.** `tight` is the distance
 * between a label and its value, and the name of a part is not a label: under
 * the 32px that separates one part from the next, 8px leaves the page a single
 * rhythm, and the name crowds the first thing in the block.
 */
export function Section({ title, note, at, aside, fill = false, children }: {
  title: string
  /**
   * What the part is for, for the parts whose name does not say it.
   *
   * **Only those.** A line under every name is a page of sentences nobody
   * reads, and the names stop being read along with them — so this says what a
   * reader could not have worked out from "公開バージョン", and nothing that
   * repeats it.
   *
   * **One string is one line.** A note that says several things is given as
   * several strings, one per thing, so that a line ends where a thought does
   * and not where the window happens to — five sentences run together across
   * the width of a table are read as a paragraph, and a paragraph under a
   * name is skipped.
   */
  note?: string | readonly string[]
  /** The anchor of the whole section, when it draws one field. */
  at?: string
  /**
   * What stands beside the name: the badge naming the notation of a section's
   * one field (`fields.tsx` の `Section`), which has no name row of its own to
   * carry it.
   */
  aside?: ReactNode
  /** Take the room left in the column above (`base.tsx` の `Stack` の `fill`). */
  fill?: boolean
  children: ReactNode
}) {
  return (
    <Stack gap="normal" as="section" fill={fill}>
      {/* **The line belongs to the name, not to what follows.** At `tight` it
          sits under the heading as part of it; at the section's own `normal` it
          would float between the two, belonging to neither. */}
      <Stack gap="tight">
        {/* A mark for the whole section sits beside its name rather than under
            it: on a line of its own it reads as belonging to the first value. */}
        {/* The name carries no colour: on a face made of fields and buttons, a
            blue line is read as something to press before it is read as a name.
            What says "this names what follows" is the rule beside it. */}
        <h2 className="flex flex-wrap items-center gap-2 border-brand border-l-4 pl-2.5 font-medium text-ink text-lg">
          {title}
          {aside}
          {at !== undefined && <Annotation at={at} name={title} />}
        </h2>
        {note !== undefined && (
          <div className="flex flex-col gap-1 text-ink-muted text-sm">
            {(typeof note === "string" ? [note] : note).map((line) => <p key={line}>{line}</p>)}
          </div>
        )}
      </Stack>
      {at === undefined ? children : <Place at={at}>{children}</Place>}
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
 * **A value stays whole in its column unless it says `split`** (`KeyValue`).
 * Split at the foot of one, a sentence continued at the head of the other can
 * read as a second answer, so short values keep together. A value long enough
 * to outweigh all the others together — a study's methods at twenty lines,
 * against one line of participants — is the exception: kept whole it fills one
 * column while the other stands nearly empty.
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

/**
 * An identifier with the mark of what it names before it — `book` for a
 * research, `database` for a dataset (`docs/ui.md` の「識別子の頭のアイコン」).
 *
 * **The mark is chosen by what the identifier points at, never by where it
 * stands**: the same ID stands in a listing, a table of a page and a table of
 * publications, and a mark picked per place gives one thing two faces. **The
 * mark is muted** — the identifier already carries the link's colour, and a
 * brand mark beside it would make two things in one row shine alike.
 *
 * It is the pair and nothing around it, so the cell or the list it stands in
 * decides how it wraps.
 */
export function IdMark(props: {
  kind: "research" | "dataset"
  /** Where the identifier leads; left out, it is text. */
  to?: string | null
  children: ReactNode
} & ({ newTab?: false } | {
  /**
   * The identifier opens its page in a new tab (`ExternalLink`), for a screen
   * somebody is working down. The link is a box that centres its contents, so
   * the mark is centred with it and the pair sits by its top — a box that
   * centres takes its baseline from the words inside and would stretch the row.
   */
  newTab: true
  locale: Locale
})) {
  const { kind, to = null, children } = props
  const mark = <Icon name={SUBJECT_ICON[kind]} aria-hidden="true" className={props.newTab === true ? "text-ink-muted" : "mr-1 text-ink-muted"} />
  if (props.newTab === true) {
    return (
      <span className="inline-flex items-center gap-1 align-top text-nowrap">
        {mark}
        {to === null ? children : <ExternalLink to={to} locale={props.locale}>{children}</ExternalLink>}
      </span>
    )
  }
  return (
    <>
      {mark}
      {to === null ? children : <Link to={to}>{children}</Link>}
    </>
  )
}

export interface DatasetIdItem {
  label: string
  to: string | null
  /** Another research's dataset: that research's ID, after it, as a way to its page. */
  research?: { label: string, to: string | null } | null
}

/**
 * Dataset IDs in a cell, **cut to a few with the rest a press away** (`Clamped`):
 * one row can name sixty-seven accessions, and a row that tall pushes every row
 * under it off the screen. Each is one `IdMark`, and none breaks across a line.
 */
export function DatasetIds({ items, shown, newTab = false, locale }: {
  items: readonly DatasetIdItem[]
  shown?: number
  /** Each opens its page in a new tab (`IdMark` の `newTab`). */
  newTab?: boolean
  locale: Locale
}) {
  const messages = messagesFor(locale)
  return (
    <Clamped
      shown={shown}
      more={(rest) => messages.search.andMore(rest)}
      less={messages.search.showLess}
      items={items.map((item) => newTab
        ? <IdMark key={item.label} kind="dataset" to={item.to} newTab locale={locale}>{item.label}</IdMark>
        : (
            <span key={item.label} className="whitespace-nowrap">
              <IdMark kind="dataset" to={item.to}>{item.label}</IdMark>
              {item.research != null && (
                <>
                  {" ("}
                  {item.research.to === null ? item.research.label : <Link to={item.research.to}>{item.research.label}</Link>}
                  )
                </>
              )}
            </span>
          ))}
    />
  )
}

/**
 * A framed box named on a band across its top — one of several of the same
 * kind on a page (the versions of a research, the experiments of a dataset).
 *
 * **The band is what separates them**: a grey strip is the weakest thing on a
 * page whose whole job is to tell these apart. The box clips the band rather
 * than rounding it (`docs/ui.md` の「線を持つ箱に帯を敷くときは、帯を丸めず箱の
 * 側で切る」), and the name and the body keep one weight and one inset whatever
 * the page.
 */
export function BandBox({ as: Box = "section", level, title, aside, children }: {
  as?: "section" | "li"
  /** The heading's level on the page it stands in. */
  level: 2 | 3
  title: ReactNode
  /** What stands at the band's far end, such as a date. */
  aside?: ReactNode
  children: ReactNode
}) {
  const Heading = level === 2 ? "h2" : "h3"
  return (
    <Box className="overflow-hidden rounded border border-line">
      <Band>
        <Heading className="flex flex-wrap items-center gap-2 font-semibold">{title}</Heading>
        {aside}
      </Band>
      <div className="px-4 py-3">{children}</div>
    </Box>
  )
}

/**
 * A short list of names and values in two narrow columns — the name at the
 * left, its value beside it.
 *
 * **For a few facts inside a section or a box**, where `Pairs`' two newspaper
 * columns would set a name far from its value or split four lines across a
 * page. **The name and the first line of the value share a baseline**, so a
 * value that is a control or runs to several lines still starts on its name's
 * line. The gap between two facts is the one between a label and its value.
 */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 text-sm">{children}</dl>
}

export function Fact({ name, children }: { name: ReactNode, children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-ink-muted">{name}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

/**
 * A label and its value.
 *
 * **A value that says `split` may run from the foot of one column to the head
 * of the next** (`Pairs`), but its label never stays behind on its own: a
 * label at the foot of a column with its value at the head of the other reads
 * as a label with nothing under it. Keeping the two together is a rule a flex
 * column cannot carry across a column break, so a split pair is laid out as
 * plain blocks, with the gap the stack would have given it.
 */
export function KeyValue({ title, at, split = false, children }: {
  title: string
  /** The anchor of the value below, when the page has one for it. */
  at?: string
  /** Let the value continue into the next column (`Pairs`). */
  split?: boolean
  children: ReactNode
}) {
  const label = (
    <dt className={`flex flex-wrap items-center gap-2 text-ink-muted text-xs ${split ? "mb-2 break-after-avoid" : ""}`}>
      {title}
      {at !== undefined && <Annotation at={at} name={title} />}
    </dt>
  )
  const value = <dd>{at === undefined ? children : <Place at={at}>{children}</Place>}</dd>
  if (split) {
    return (
      <div className="py-2">
        {label}
        {value}
      </div>
    )
  }
  return (
    <div className="break-inside-avoid py-2">
      <Stack gap="tight">
        {label}
        {value}
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

/**
 * Where a frozen column stands — not how wide it is.
 *
 * **No width here at all.** What a listing freezes first is a mark on one side
 * and a name on the other, and the two are nothing like the same width; the
 * cells already say which they are (`Td` の `holds` と `floor`). A width
 * written here would reach both and squeeze the name into the mark's 60px.
 *
 * **A second column can only be frozen behind a mark.** Its `left` is the mark
 * column's width written out, which is the one width this file knows — so a
 * listing that freezes two has to lead with a mark, and one that leads with
 * anything else freezes only the first.
 */
const STUCK = [
  "sticky left-0 z-10",
  "sticky left-15 z-10",
]

/**
 * How the band carries on across a frozen header cell.
 *
 * **A frozen cell has to paint its own background** — the cells sliding under it
 * would show through otherwise — and painting it flat restarts the sweep. The
 * cell then holds the colour the band has at 0 while the band beside it has
 * already travelled: 164px of a 1,200px sweep is 13.7% along, and the two meet
 * as a vertical seam down the header.
 *
 * **So the cell takes the same sweep, pushed left by where the cell stands.**
 * The size is written out because the origin has to be the table's, not the
 * cell's; without it the sweep would be as wide as the cell and run its whole
 * range inside 60px.
 */
const STUCK_BAND = [
  "bg-[length:1200px_100%] bg-[position:0px_0] bg-no-repeat",
  "bg-[length:1200px_100%] bg-[position:-60px_0] bg-no-repeat",
]

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
 * Where a cell's content sits in a row taller than it is.
 *
 * **Top by default, because a listing's rows are not one line.** A study's title
 * runs to three lines and its datasets to four, and the reader takes a row by
 * reading across its first line — a date centred against a four-line cell sits
 * beside nothing.
 *
 * **Middle where every row is one line.** Then the tallest thing in the row is
 * not text at all but a control (36px against 22.4px), and top alignment leaves
 * each cell lifted by a different amount: measured on the cart at 16.4px for a
 * label, 17.2px for a badge and 18.0px for a button, against a row whose middle
 * is 18.5px. Nothing is aligned to anything, which is what reads as "not quite
 * centred" rather than as a mistake anyone can point at.
 */
const CellAlign = createContext<"top" | "middle">("top")

const ALIGN = { top: "align-top", middle: "align-middle" }

/** Where a row-sized control (24px) stands in a top-set row so its middle meets the first line's (6px + 22.4px / 2). */
const CONTROL_ON_FIRST_LINE = "pt-1.25"

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
 *
 * **A table with no rows is still the table**, and `whenEmpty` is what stands
 * where the rows would be. Swapping the whole table for a box of prose loses the
 * column names, which are what say what was being looked for, and moves
 * everything below it — a reader who narrowed one step too far has to work out
 * where they now are before they can take that step back. **The single cell
 * spans every column**, which also lets the columns collapse to the width of the
 * window: the floors are carried by `Td`, so a table of one wide cell stops
 * travelling sideways for as long as it has no rows.
 */
/**
 * A column name that sits over numbers: the name goes to the right, where the
 * digits end, so the column reads as one thing from its head to its foot.
 */
export interface NumericHeader {
  text: string
  align: "right"
}

function isNumericHeader(header: ReactNode | NumericHeader): header is NumericHeader {
  return typeof header === "object" && header !== null && "align" in header
}

export function Table({ headers: named, children, stuck = 0, whenEmpty, align = "top", actions }: {
  headers: (ReactNode | NumericHeader)[]
  /**
   * The rows end in a column of things to press, **named for anyone hearing the
   * row read aloud and nowhere else** — a word over a column of marks is a
   * heading for something already said, and it drags the column off its own
   * width (`docs/ui.md` の「押せるものの大きさ」). `true` names it 「操作」; a
   * public table gives its own word.
   */
  actions?: boolean | string
  children: ReactNode
  /** How many of the leading columns stay put when the table scrolls sideways. */
  stuck?: number
  /**
   * What to put in place of the rows when there are none.
   *
   * Left out, an empty table draws an empty body — which is right where the
   * caller has already said elsewhere that nothing came back.
   */
  whenEmpty?: ReactNode
  /**
   * Where the cells sit in a row taller than their content (`CellAlign`).
   *
   * **`middle` only where a row cannot run to two lines.** The cart is the
   * clearest case: three labels, a badge and a button, none of which wraps.
   */
  align?: "top" | "middle"
}) {
  const headers = actions === undefined || actions === false
    ? named
    : [...named, <span key="actions" className="sr-only">{actions === true ? messagesFor("ja").admin.actions : actions}</span>]
  const box = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const [reach, setReach] = useState({ back: false, on: false })
  /** How wide the table is while it does not fit, and 0 while it does. */
  const [span, setSpan] = useState(0)

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
    const wide = room > 0 ? el.scrollWidth : 0
    setSpan((was) => (was === wide ? was : wide))
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

  // Two boxes over one table: whichever of them the reader took hold of, the
  // other is put where that one is. The guard is what keeps the pair from
  // handing the same scroll back and forth, since moving one raises the event
  // the other is listening for.
  const tie = useCallback((from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from === null || to === null || to.scrollLeft === from.scrollLeft) return
    to.scrollLeft = from.scrollLeft
  }, [])

  const edgeAt = reach.back ? stuck - 1 : -1

  return (
    <div>
      {/*
        **A second bar above the table, because the one under it is out of
        reach.** A listing stands taller than the window, so the box's own
        scrollbar is below the fold: the shaded edge says that the table travels
        sideways, but nothing says how far along it the reader is, and there is
        nothing to take hold of without reading to the end of the page first.

        **It is a real scrollbar rather than a drawn one** — a strip of overflow
        holding the table's own width — so the browser draws it, sizes it and
        answers a drag on it exactly as it does the one below.

        **It is there only while the table has somewhere to travel**, and it is
        out of the reading order: the same scroll is reachable from the box
        below, and a second stop offering nothing to read is noise to anyone
        listening.
      */}
      {span > 0 && (
        <div
          ref={rail}
          className="overflow-x-scroll"
          aria-hidden="true"
          tabIndex={-1}
          onScroll={() => { tie(rail.current, box.current) }}
        >
          <div style={{ width: span }} className="h-px" />
        </div>
      )}
      <div className="relative">
        <div
          ref={box}
          className="overflow-x-auto"
          onScroll={() => {
            measure()
            tie(box.current, rail.current)
          }}
        >
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
                  **A word in the band stays on one line, which makes it the
                  other thing a column is at least as wide as.** The floors
                  below are measured from the values (`Td` の `floor`), and a
                  date is 96px — but the word naming that column is 124px in
                  English, so at the table's narrowest the band was the only
                  part that broke. **The band has to be one line**: it is one
                  row of one table, and a column whose name wrapped made every
                  other column's name sit against the top of a box half again
                  as tall.

                  **The width comes from the word rather than from a number
                  written here**, because the word is different in each
                  language — 「公開日」 needs 42px where `Date published` needs
                  100.4px, and a floor big enough for the longer one is 28px of
                  space nobody uses in the other.

                  **A header that is a control still asks for nothing.** A mark
                  is 36px against a line of 22.4px, so the padding a word needs
                  would make the band half as tall again — which is what made the
                  two listings, drawn from the same frame, open with bands of two
                  different heights. It carries no word, so keeping a word on one
                  line cannot widen it either.

                  **The band centres what it holds, whatever `align` says.** That
                  choice is about the rows, where a cell may run to three or four
                  lines and top is the only edge they share. **A header is one
                  line by decision** (the word does not wrap), so it has no such
                  reason — and left at the top, a name 16px tall and a 36px mark
                  in the same 36px band come out 1px apart, which is the band
                  reading as not quite straight.
                */}
                {headers.map((header, index) => (
                  <th
                    key={index}
                    // Which column a value belongs to, for a reader who hears
                    // the row rather than seeing it line up under the name.
                    scope="col"
                    className={`px-3 align-middle font-semibold ${typeof header === "string" || isNumericHeader(header) ? "whitespace-nowrap py-1.5" : `${CEILING} ${MARK_COLUMN} py-0`} ${isNumericHeader(header) ? "text-right" : ""} ${index < stuck ? `${STUCK[index] ?? ""} ${BAND_FILL.brand} ${STUCK_BAND[index] ?? ""} ${index === edgeAt ? FROZEN_EDGE : ""}` : ""}`}
                  >
                    {isNumericHeader(header) ? header.text : header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <CellAlign.Provider value={align}>
                <FrozenEdgeAt.Provider value={edgeAt}>
                  {whenEmpty !== undefined && Children.count(children) === 0
                    ? (
                        <tr>
                          {/* Its own cell rather than `Td`: the floor and the
                            ceiling a column keeps are what this row is spanning
                            past, and the frozen columns have nothing to freeze. */}
                          <td colSpan={headers.length} className="border-line border-b px-3 py-4">
                            <Empty>{whenEmpty}</Empty>
                          </td>
                        </tr>
                      )
                    : children}
                </FrozenEdgeAt.Provider>
              </CellAlign.Provider>
            </tbody>
          </table>
        </div>
        {/* With a frozen column the near edge is that column's own shadow, so the
            strip is only drawn where there is nothing standing at it. */}
        {reach.back && stuck === 0 && <div className={EDGE_SHADE.left} />}
        {reach.on && <div className={EDGE_SHADE.right} />}
      </div>
    </div>
  )
}

/**
 * How wide a cell goes before what it holds falls to the next line.
 *
 * **A cell that cannot wrap has no ceiling.** The limit keeps one long sentence
 * from taking the table, but a `nowrap` cell holds an identifier that has
 * nowhere to fall — and a table cell does not clip, so the glyphs run past the
 * edge and sit on the column beside it (measured at 66px over, on a slug 402px
 * wide in a cell given 336px). The table scrolls sideways instead, which is
 * what `overflow-x` is already there for.
 */
const CEILING = "max-w-88"

export function Td({ children, nowrap = false, holds, stuck, colSpan, floor, className = "" }: {
  children?: ReactNode
  /** For a cell holding an identifier, which must not be broken to fit. */
  nowrap?: boolean
  /**
   * What the cell holds, where that is an operation rather than a value.
   *
   * **Neither kind keeps room above and below.** A cell that padded its control
   * would make the row half as tall again and leave the control sitting below
   * the words beside it; without the padding the row is as tall as its text and
   * the control rides inside it (`docs/ui.md` の「押せるものの大きさ」). **In a
   * table set to the top, a control is lowered onto the first line** — the
   * text below its neighbours' 6px starts lower than a control flush with the
   * row's top, and a 24px control centred on a 22.4px line sits 5px down.
   *
   * The two differ in width. **A `mark` is one glyph**, so the column is a
   * fixed 60px wherever it stands — left to the content it came out 60px in one
   * listing and 74px in the next. **A `control` carries a word**, so its width
   * is the word's; what it shares with a mark is only the missing padding.
   */
  holds?: "mark" | "control"
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
   * **The first frozen column has none** — `MARK_COLUMN` fixes it, because the
   * second reads that width as its own `left`. **The second one needs a floor of
   * its own**: `STUCK` says where it stands, not how wide it is, and what it
   * holds differs between the listings. Left to the content the width follows
   * whatever rows a page happens to hold, which moves the start of the sideways
   * scroll every time a page is turned.
   */
  floor?: string
  className?: string
}) {
  const edgeAt = useContext(FrozenEdgeAt)
  const align = useContext(CellAlign)
  return (
    <td
      colSpan={colSpan}
      className={`${nowrap ? "" : CEILING} border-line border-b px-3 ${ALIGN[align]} ${holds === undefined ? `${floor ?? (stuck === undefined ? "min-w-28" : "")} py-1.5` : `py-0 ${holds === "mark" ? MARK_COLUMN : ""} ${holds === "control" && align === "top" ? CONTROL_ON_FIRST_LINE : ""}`} ${nowrap ? "whitespace-nowrap" : ""} ${stuck === undefined ? "" : `${STUCK[stuck] ?? ""} bg-white ${stuck === edgeAt ? FROZEN_EDGE : ""}`} ${className}`}
    >
      {children}
    </td>
  )
}

/**
 * A code — a slug, an accession, a facet's key — standing in a line of words.
 *
 * **It takes one line's height and sits in the middle of it**, the box a badge
 * stands in (`base.tsx` の `Badge`), because it is set in another face: aligned
 * by its baseline to the words beside it, a monospace face's glyphs sit a pixel
 * lower than the sans ones and stretch the line box a pixel taller, so a column
 * of slugs beside a column of titles reads as not quite settled. In a box of
 * its own line's height the face's glyphs are centred where the words' are.
 *
 * **The size goes on the code, the layout on the box**, for the reason a
 * badge's does: `1lh` is read off the box, and a smaller size there would make
 * it a shorter box than the line it stands in.
 *
 * **Not for a block of code.** A `pre` sets its own lines, and a box of one
 * line's height would cut off everything after the first.
 */
export function Code({ children, size, muted = false, className = "" }: {
  children: ReactNode
  size?: "xs" | "sm"
  muted?: boolean
  /** How the box sits in its row — a width, a margin — never a size of type. */
  className?: string
}) {
  return (
    <span className={`inline-flex h-[1lh] items-center align-top ${className}`}>
      <code className={`${size === undefined ? "" : `text-${size}`} ${muted ? "text-ink-muted" : ""}`}>
        {children}
      </code>
    </span>
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
const PAGE_STEP = `group/way ${PAGE_BOX} ${LISTING_CONTROL} hover:bg-surface-hover`
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
          <Chevron dir="left" />
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
          <Chevron dir="right" />
        </Link>
      )}
    </nav>
  )
}

/**
 * How much of a listing is on screen, and the way to the rest.
 *
 * **The two are one thing said twice** — both answer "which page of how many am
 * I looking at" — so they are drawn together rather than placed by each screen.
 * Written apart they drift, and the management area is where that showed: five
 * listings said it five ways, one of them counting a whole vocabulary while the
 * rows on screen were a search within it, and two not saying it at all.
 *
 * **The range, not the total.** "675 件" over twenty rows says nothing about
 * which twenty. The bare total is the answer only when there is no page to be
 * on, which is what nothing-matched is.
 *
 * The bounds come from the loader, like everything else about which rows these
 * are: how many fill a page belongs to the module that asked for them, and a
 * route that read that number out of a `.server` module could not be split
 * from its loader.
 */
export function Paging({ locale, total, from, to, page, pageCount, at, most }: {
  locale: Locale
  total: number
  /** 1-based positions of the shown rows within the whole result. */
  from: number
  to: number
  page: number
  pageCount: number
  at: (page: number) => string
  /** At most this many page numbers, where the room for them is short. */
  most?: number
}) {
  const messages = messagesFor(locale)
  // **The gap is a third of what separates the pair from the rest of the row.**
  // At one distance for everything, the count floats between two controls and
  // reads as belonging to neither.
  //
  // **The row keeps the height of the steps whether or not they are drawn.** A
  // listing that fits on one page has nothing to page through, and the row fell
  // from 36px to the 22.4px of the line saying how many there are — which moves
  // the table above it and the whole page below it as a reader narrows a search
  // (measured on the research listing: the tools row 36 → 32.4px, the table's
  // head 204 → 199px, the run under it 36 → 22.4px). This is the rule the top
  // bar keeps for the same reason (`docs/ui.md` の「押せるものの大きさ」): what
  // stands in a row settles that row's height once, for every state it has.
  return (
    <div className="flex min-h-tap flex-wrap items-center gap-2">
      <p className="text-ink-muted text-sm">
        {total === 0 ? messages.search.results(0) : messages.search.range(from, to, total)}
      </p>
      <PageLinks
        label={messages.search.pagination}
        page={page}
        pageCount={pageCount}
        at={at}
        previous={messages.search.previousPage}
        next={messages.search.nextPage}
        most={most}
      />
    </div>
  )
}

/**
 * How many rows are standing, where a listing that pages says which page of how
 * many is on screen.
 *
 * **There is no range to give.** A listing that is never cut into pages shows
 * the whole of what it counts, so the bare total is the answer rather than the
 * half-truth it would be over twenty rows of six hundred. It stands where
 * `Paging` stands, so that the one place a reader looks for a count is the same
 * on every listing — a table that cannot page is still a table somebody wants
 * to know the size of.
 */
export function Counted({ locale, total }: { locale: Locale, total: number }) {
  const messages = messagesFor(locale)
  // The row keeps the height of the steps it does not draw, for the reason
  // `Paging` does: what stands in a row settles that row's height once.
  return (
    <div className="flex min-h-tap flex-wrap items-center justify-end gap-2">
      <p className="text-ink-muted text-sm">{messages.search.results(total)}</p>
    </div>
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
 * would look like a value nobody thought worth filling in. **The frame asks
 * rather than names a state** — the reader is a provider, and what the office
 * wants from them at this slot is the value (docs/editing.md の「レビュー」).
 */
export function Value({ field, locale }: { field: FieldView, locale: Locale }) {
  if (field.state === "not-applicable") {
    return <span className="text-ink-muted italic">{messagesFor(locale).notApplicable}</span>
  }
  if (field.state === "unsettled") {
    return <Badge tone="danger" dashed>{messagesFor(locale).preview.unsettledMark}</Badge>
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
      // **Top-aligned, the way a badge is.** An inline-flex box is placed on
      // the line by the baseline of its first item, and a slug set in a
      // monospace face carries its baseline a pixel lower than the words in
      // the next cell — which put the whole link a pixel down and stretched
      // the row by two. The box is one line tall, so its top is the line's.
      className="inline-flex items-center gap-1 align-top"
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
