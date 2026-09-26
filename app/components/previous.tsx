/**
 * What the published version shows where the draft shows something else, set
 * beside what the draft shows.
 *
 * The indicator exists so that nobody has to hunt for what changed, and it opens to
 * the two values side by side because the next question after "this changed"
 * is always "from what, to what". Each side is marked where it parts from the
 * other — what the published version loses on the left, what the draft adds
 * on the right — so the change reads without comparing the two by eye.
 */

import { Fragment, useState, type ReactNode } from "react"

import type { ShownLine } from "~/admin/changes"
import { toPlainText } from "~/content/richtext"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { AnchoredValue, RowsView } from "~/public/view.server"
import { compareRows, type ComparedRow } from "~/review/compare-rows"
import { afterParts, beforeParts, diffSentences, type DiffPart } from "~/passage-diff"

import { Dialog } from "./base"
import { Flag } from "./flags"
import { NotApplicable, Table, Td } from "./page"

/** One side of one line: its text, or the state it shows instead. */
type Side
  = | { state: "value", text: string }
    | { state: "unknown" | "not-applicable" }

/** A line of the comparison: a language, or a row of a list, with both sides. */
export interface CompareRow {
  /** `ja` / `en`, or empty for a value with no language. */
  label: string
  before: Side | null
  after: Side | null
}

/**
 * The indicator, and the comparison it opens.
 *
 * **The indicator is a large badge** (`base.tsx` の `Badge` の `large`): a
 * dashed accent edge on a pale accent tint, with its kind's ± glyph — the same shape as
 * the request for a value, in red. What changed is what a provider reviewing
 * an update reads first, and styled as the small comment button beside it the
 * word was lost among the headings. It is a button that opens the comparison.
 * **Where there is nothing to set side by side** — a list whose difference is
 * which elements it holds — it is the same badge, opening nothing.
 */
function ChangeIndicator({ locale, fieldLabel, children }: {
  locale: Locale
  fieldLabel?: string
  /** The comparison the indicator opens, or null where there is none to open. */
  children: ReactNode
}) {
  const t = messagesFor(locale)
  const [open, setOpen] = useState(false)

  if (children === null) return <Flag kind="differs" large>{t.preview.differsHere}</Flag>

  return (
    <span className="inline-flex">
      <Flag kind="differs" large onClick={() => { setOpen(true) }}>
        {t.preview.differsHere}
      </Flag>
      <Dialog
        title={fieldLabel === undefined ? t.preview.changeHeading : t.preview.fieldChangeHeading(fieldLabel)}
        held={{ open, close: () => { setOpen(false) } }}
        dismiss={t.comment.close}
        wide
      >
        {children}
      </Dialog>
    </span>
  )
}

/** One line of the comparison as it is drawn: a sentence each side, or a state. */
interface Line {
  same: boolean
  before: Side | null
  after: Side | null
  /** Both sides' pieces, where both sides are text to compare piece by piece. */
  parts: DiffPart[] | null
}

/**
 * A language's two sides as lines: a sentence to a line where both are text
 * (`passage-diff.ts` の `diffSentences`), one line where either is a state.
 */
export function linesOf(row: CompareRow): Line[] {
  const { before, after } = row
  if (before?.state === "value" && after?.state === "value") {
    return diffSentences(before.text, after.text).map((one) => one.kind === "same"
      ? { same: true, before: { state: "value", text: one.text }, after: { state: "value", text: one.text }, parts: null }
      : {
          same: false,
          before: one.before === null ? null : { state: "value", text: one.before },
          after: one.after === null ? null : { state: "value", text: one.after },
          parts: one.parts,
        })
  }
  return [{ same: before !== null && sameSide(before, after), before, after, parts: null }]
}

/**
 * The two sides in two columns — the split view of a code review, since that
 * is where a reader has learnt to read one.
 *
 * **A line is a sentence**, so a paragraph in which one sentence moved is
 * tinted at that sentence and not as a whole, and the sentences around it
 * are shown as they were to find one's place by. **A side that changed is tinted
 * as a line, and the pieces that differ a step deeper** — red where the
 * published version loses them, green where the draft gains them — and a
 * line through (or under) what changed shows the same without the colour.
 * **The lines are set close**, at the leading of a code review rather than of
 * a page: a paragraph of ten sentences is ten lines, and at a page's spacing
 * one field's comparison outgrew the window. **The language column is ruled off** from
 * the two sides, so `ja` / `en` read as the name of the lines beside them and
 * not as the first word of the published side. **Both columns are one width**,
 * whichever shows more. **A grid, not a table** — a table here is a listing
 * (`page.tsx` の `Table`), with floors and ceilings on its cells and a rail to
 * scroll along.
 */
export function CompareTable({ locale, against, after, rows }: {
  locale: Locale
  /** What the left column is (「公開中の v4」「現在の下書き」). */
  against: string
  /** What the right column is, when it is not the draft being written (an import's source). */
  after?: string
  rows: readonly CompareRow[]
}) {
  const t = messagesFor(locale).preview
  const labelled = rows.some((row) => row.label !== "")
  const head = "select-none border-line border-b bg-surface-light px-2 py-1 font-semibold text-ink-muted text-xs"
  // **A drag selects one side only.** The lines are a grid read across, so a
  // selection started in one column ran on through the other and a copied
  // paragraph came out interleaved with its counterpart. Where the press lands
  // decides the side, and the other one is taken out of the selection.
  const [side, setSide] = useState<"del" | "ins" | null>(null)

  return (
    <div
      data-pick={side ?? undefined}
      onPointerDown={(event) => {
        const cell = event.target instanceof Element ? event.target.closest("[data-side]") : null
        const picked = cell?.getAttribute("data-side")
        setSide(picked === "del" || picked === "ins" ? picked : null)
      }}
      className={`grid overflow-hidden rounded border border-line text-sm ${labelled ? "grid-cols-[2.5rem_1fr_1fr]" : "grid-cols-2"} data-[pick=del]:[&_[data-side=ins]]:select-none data-[pick=ins]:[&_[data-side=del]]:select-none`}
    >
      {labelled && <span className={`${head} border-r`} />}
      <span className={head}>{against}</span>
      <span className={`${head} border-l`}>{after ?? t.compareDraft}</span>
      {rows.map((row, at) => linesOf(row).map((line, index) => {
        const edge = at === 0 || index > 0 ? "" : "border-line border-t"
        return (
          <Fragment key={`${at}-${row.label}-${index}`}>
            {labelled && (
              <span className={`${edge} select-none border-line border-r px-2 py-0.5 text-ink-muted text-xs leading-snug`}>
                {index === 0 ? row.label : ""}
              </span>
            )}
            <SideCell locale={locale} line={line} kind="del" edge={edge} />
            <SideCell locale={locale} line={line} kind="ins" edge={`${edge} border-line border-l`} />
          </Fragment>
        )
      }))}
    </div>
  )
}

/**
 * A section that is a table of elements — providers, projects, grants,
 * publications — compared as **the table the page draws, once**, rather than as
 * two columns of words: an element is a row of several cells, and two tables
 * side by side do not fit the panel. It is the page's own `Table`, headings and
 * all, so the rows read as the section a reader meets. Rows pair by the element's id
 * (`review/compare-rows.ts`). A row the draft dropped is struck through on the
 * published tint, a row it added is underlined on the draft's, and a row whose
 * cells moved shows each moved cell twice — the published words over the
 * draft's, the pieces that differ a step deeper. Rows that did not move stand
 * untinted, to read one's place by. Above the table, how many rows each side
 * holds: a side that holds none is said, not left as an empty column.
 */
export function RowsCompare({ locale, against, before, after }: {
  locale: Locale
  against: string
  before: RowsView
  after: RowsView | null
}) {
  const t = messagesFor(locale).preview
  const rows = compareRows(before, after)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-muted text-xs">
        {t.rowCount(against, before.rows.length)}
        {" / "}
        {t.rowCount(t.compareDraft, after?.rows.length ?? 0)}
      </p>
      <Table headers={before.columns}>
        {rows.map((row) => (
          <tr key={`${row.kind}-${row.id}`} className={row.kind === "removed" ? LOOK.del.line : row.kind === "added" ? LOOK.ins.line : ""}>
            {row.cells.map((text, at) => (
              <Td key={before.columns[at] ?? at} className="whitespace-pre-wrap break-words">
                <RowCell row={row} at={at} text={text} />
              </Td>
            ))}
          </tr>
        ))}
      </Table>
    </div>
  )
}

function RowCell({ row, at, text }: { row: ComparedRow, at: number, text: string }) {
  if (row.kind === "removed") return <del className={LOOK.del.highlight}>{text}</del>
  if (row.kind === "added") return <ins className={LOOK.ins.highlight}>{text}</ins>
  const parts = row.kind === "changed" ? row.parts[at] ?? null : null
  if (parts === null) return <>{text}</>
  const side = (kind: "del" | "ins") => {
    const Tag = kind
    const look = LOOK[kind]
    return (
      <div className={`-mx-2 px-2 ${look.line}`}>
        {(kind === "del" ? beforeParts : afterParts)(parts).map((part, index) => part.kind === "same"
          ? <span key={index}>{part.text}</span>
          : <Tag key={index} className={`rounded ${look.word} ${look.highlight}`}>{part.text}</Tag>)}
      </div>
    )
  }
  return (
    <>
      {side("del")}
      {side("ins")}
    </>
  )
}

/**
 * The two sides' tints, and the line through (or under) what changed — the
 * sign that shows the same without the colour. **No `−` / `+` at the head of a
 * line**: the values are prose, and a dash or a plus is as often a character
 * of the value as a sign beside it.
 */
const LOOK = {
  // The line through is drawn lighter than the words it crosses, so that what
  // was struck can still be read.
  del: { line: "bg-diff-del", word: "bg-diff-del-word", highlight: "line-through decoration-ink/40" },
  ins: { line: "bg-diff-ins", word: "bg-diff-ins-word", highlight: "underline underline-offset-2" },
} as const

/**
 * One side of one line.
 *
 * **What changed is marked by the element as well as by the colour** —
 * `<del>` and `<ins>` are what a screen reader announces. A sentence only one
 * side has is marked as a whole line, and the pieces inside it are not: every
 * one of them is new. A state is said in words.
 */
function SideCell({ locale, line, kind, edge }: {
  locale: Locale
  line: Line
  kind: "del" | "ins"
  edge: string
}) {
  const states = messagesFor(locale)
  const look = LOOK[kind]
  const side = kind === "del" ? line.before : line.after
  const parts = line.parts === null ? null : (kind === "del" ? beforeParts : afterParts)(line.parts)
  const changed = !line.same && side !== null
  const Tag = kind

  let body: ReactNode = null
  if (side !== null && side.state !== "value") {
    body = side.state === "unknown"
      ? <em className="text-ink-muted">{states.unsettled}</em>
      : <NotApplicable locale={locale} />
  } else if (side !== null && parts === null) {
    body = changed ? <Tag className={look.highlight}>{side.text}</Tag> : side.text
  } else if (parts !== null) {
    body = parts.map((part, at) => {
      const key = `${at}-${part.kind}`
      if (part.kind === "same") return <span key={key}>{part.text}</span>
      return <Tag key={key} className={`rounded ${look.word} ${look.highlight}`}>{part.text}</Tag>
    })
  }

  return (
    <div data-side={kind} className={`${edge} min-w-0 whitespace-pre-wrap break-words px-2 py-0.5 leading-snug ${changed ? look.line : ""}`}>
      {body}
    </div>
  )
}

function sameSide(a: Side, b: Side | null): boolean {
  if (a.state !== b?.state) return false
  return a.state !== "value" || (b.state === "value" && a.text === b.text)
}

/** On a preview, where both values are the ones the page draws. */
export function PreviousIndicator({ locale, value, current, heading, fieldLabel }: {
  locale: Locale
  value: AnchoredValue | undefined
  /** What the draft shows at the same place. */
  current: AnchoredValue | undefined
  /** What is being compared against, as the screen words it. */
  heading: string
  fieldLabel?: string
}) {
  const against = againstOf(locale, heading)
  let body: ReactNode = null
  if (value?.kind === "rows") {
    body = (
      <RowsCompare
        locale={locale}
        against={against}
        before={value.rows}
        after={current?.kind === "rows" ? current.rows : null}
      />
    )
  } else if (value !== undefined) {
    const rows = [{ label: "", before: anchoredSide(value), after: current === undefined ? null : anchoredSide(current) }]
    body = <CompareTable locale={locale} against={against} rows={rows} />
  }
  return <ChangeIndicator locale={locale} fieldLabel={fieldLabel}>{body}</ChangeIndicator>
}

/**
 * The same indicator on an editing screen, where a value is a form value rather than
 * a rendered one, and the draft's side is what the form holds now.
 */
export function PreviousLines({ locale, lines, current, heading, fieldLabel, termLabel }: {
  locale: Locale
  lines: readonly ShownLine[] | null
  current: readonly ShownLine[] | null
  heading: string
  fieldLabel?: string
  termLabel?: (id: string) => string
}) {
  const rows = lines === null || lines.length === 0 ? null : lineRows(lines, current ?? [], termLabel)
  return (
    <ChangeIndicator locale={locale} fieldLabel={fieldLabel}>
      {rows === null ? null : <CompareTable locale={locale} against={againstOf(locale, heading)} rows={rows} />}
    </ChangeIndicator>
  )
}

function againstOf(locale: Locale, heading: string): string {
  return heading === "" ? messagesFor(locale).preview.previousPublished : heading
}

/**
 * The two sides line by line. **Lines pair by position** — a value's lines are
 * its languages in a fixed order, or the rows of a list, and a row only one
 * side has is shown against nothing.
 */
export function lineRows(
  before: readonly ShownLine[],
  after: readonly ShownLine[],
  termLabel?: (id: string) => string,
): CompareRow[] {
  const count = Math.max(before.length, after.length)
  return Array.from({ length: count }, (_, at) => {
    const one = before.at(at)
    const other = after.at(at)
    return {
      label: one?.label ?? other?.label ?? "",
      before: one === undefined ? null : lineSide(one, termLabel),
      after: other === undefined ? null : lineSide(other, termLabel),
    }
  })
}

function lineSide(line: ShownLine, termLabel?: (id: string) => string): Side {
  return line.state === "value" ? { state: "value", text: shownText(line, termLabel) } : { state: line.state }
}

/**
 * What one line shows. A value made of identities reads as their labels; one
 * that also has words of its own — a disease — reads as the words with the
 * labels after them, which is how it reads on the page it came from.
 */
function shownText(line: ShownLine, termLabel?: (id: string) => string): string {
  if (line.termIds === undefined) return line.text
  const terms = line.termIds.map((id) => termLabel?.(id) ?? id).join(", ")
  if (terms === "") return line.text
  return line.text === "" ? terms : `${line.text} (${terms})`
}

/** A value the page draws, as the text it reads as. */
function anchoredSide(value: AnchoredValue): Side {
  if (value.kind === "term") return { state: "value", text: value.term?.label ?? "" }
  if (value.kind === "list") return { state: "value", text: value.items.join("\n") }
  if (value.kind === "ids") {
    if (value.ids.state === "unsettled") return { state: "unknown" }
    if (value.ids.state === "not-applicable") return { state: "not-applicable" }
    return { state: "value", text: value.ids.items.join("\n") }
  }
  if (value.kind === "rows") return { state: "value", text: value.rows.rows.map((row) => row.cells.join(" / ")).join("\n") }
  const shown = value.kind === "field" ? value.field : value.links
  if (shown.state === "unsettled") return { state: "unknown" }
  if (shown.state === "not-applicable") return { state: "not-applicable" }
  if (value.kind === "links") {
    return { state: "value", text: value.links.state === "value" ? value.links.value.map((link) => link.url).join("\n") : "" }
  }
  const field = value.field
  if (field.state === "rich") return { state: "value", text: toPlainText(field.text) }
  return { state: "value", text: field.state === "plain" ? field.text : "" }
}
