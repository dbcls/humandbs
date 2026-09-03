/**
 * What every editing screen of a draft carries, whichever thing it edits.
 *
 * Two of them are about the draft rather than about the screen, so a research
 * and one of its datasets show the same thing — the same people, the same
 * stack. **A dataset editor is an editor of the draft**, and somebody who has
 * one open is somebody to be careful of on the other. The bar and the state
 * behind it are here for the same reason: the two screens differ in what a
 * field is, not in what saving one means.
 */

import { useEffect, useState, type ReactNode } from "react"
import { Link, useFetcher, type SubmitTarget } from "react-router"

import type { FieldProblem } from "~/admin/form.server"
import { takeAll } from "~/admin/merge"
import type { PresenceView, UpstreamView } from "~/admin/pages.server"
import { PRESENCE_HEARTBEAT_SECONDS } from "~/admin/presence"
import type { UndoEntryRow } from "~/admin/queries.server"
import type { DraftSnapshot } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Button, Menu, MENU_ITEM, Stack } from "./base"
import type { Marks } from "./fields"

/**
 * Saying we are here, over and over, and showing who else is.
 *
 * The heartbeat answers with the current list, so announcing and finding out
 * are one exchange. Nobody is made read-only by any of it: a save is checked
 * against a revision, and this is only so that two people editing the same
 * thing know about each other before that happens.
 */
export function PresenceLine({ locale, path, initial }: {
  locale: Locale
  path: string
  initial: PresenceView[]
}) {
  const t = messagesFor(locale).admin.draft
  const fetcher = useFetcher<{ present: PresenceView[] }>()
  const submit = fetcher.submit

  useEffect(() => {
    const beat = () => {
      void submit({}, { method: "post", action: path })
    }
    beat()
    const timer = setInterval(beat, PRESENCE_HEARTBEAT_SECONDS * 1000)
    return () => {
      clearInterval(timer)
    }
  }, [submit, path])

  const others = (fetcher.data?.present ?? initial).filter((row) => !row.isSelf)
  if (others.length === 0) return null

  return (
    <p className="text-ink-muted text-xs">
      {`${t.alsoEditing}: ${others.map((row) => row.name).join(", ")}`}
    </p>
  )
}

/**
 * The stack of what was on screen before, and of what a conflict refused.
 *
 * Picking one puts it back into the form and nowhere else. **Nothing here
 * writes**: an entry that a conflict refused would never pass the revision
 * check anyway, and one from before a save goes back the way any other edit
 * does — by being saved.
 *
 * **An empty stack is words rather than a control that cannot be pressed.** A
 * panel is a `<details>` and has no disabled state, and there is nothing behind
 * this one to open until somebody has saved once.
 */
export function UndoMenu({ locale, entries, onPick, loading }: {
  locale: Locale
  entries: UndoEntryRow[]
  onPick: (undoId: string) => void
  loading: boolean
}) {
  const t = messagesFor(locale).admin.draft

  if (entries.length === 0) {
    return <span className="text-ink-muted text-sm">{t.undoEmpty}</span>
  }

  return (
    <Menu label={t.undo} icon="undo" word>
      {entries.map((entry) => (
        <div key={entry.id} className={MENU_ITEM}>
          <span className="flex items-center gap-3">
            <span>{stamp(entry.createdAt)}</span>
            <span className="text-ink-muted">{t.undoReason[entry.reason]}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={loading}
              onClick={(event) => {
                // Choosing an entry has to close the panel, and what it does is
                // a load rather than a move — nothing else here would close it.
                const panel = event.currentTarget.closest("details")
                if (panel !== null) panel.open = false
                onPick(entry.id)
              }}
            >
              {t.undoTake}
            </Button>
          </span>
        </div>
      ))}
    </Menu>
  )
}

/** The day and minute, which is as fine as a stack ten deep ever needs. */
function stamp(iso: string): string {
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`
}

/**
 * The bar an editing screen stands under: what is being edited, the way back
 * out of it, whether there is anything unsaved, and the way to save.
 *
 * **It stays at the top of the window.** The screens it serves are long enough
 * that the only control able to keep what has been typed would otherwise be off
 * the screen for most of the time it is being typed.
 *
 * The two screens differ only in where they lead and in what they are called,
 * so both arrive as props; `children` is whatever a screen hangs under the bar
 * — the way between its own parts.
 */
export function DraftBar({
  locale,
  heading,
  links,
  note,
  dirty,
  saved,
  saving,
  onSave,
  undo,
  onUndo,
  undoLoading,
  presencePath,
  presence,
  children,
}: {
  locale: Locale
  /** What this screen edits, as it is known: a research ID, a dataset label. */
  heading: string
  /** Where this screen leads back out to, in the order it offers them. */
  links: { to: string, label: string }[]
  /** Anything else the screen has to say about what it is editing. */
  note?: ReactNode
  dirty: boolean
  saved: boolean
  saving: boolean
  onSave: () => void
  undo: UndoEntryRow[]
  onUndo: (undoId: string) => void
  undoLoading: boolean
  presencePath: string
  presence: PresenceView[]
  children?: ReactNode
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="sticky top-0 z-10 border-line border-b bg-white py-3">
      <Stack gap="tight">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Centred rather than on the baseline: the name is a step larger
              than the links beside it, and a shared baseline drops the smaller
              of the two below the middle of the row (`docs/ui.md`). */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-bold text-lg">{heading}</h1>
            {links.map((link) => (
              <Link key={link.to} to={link.to} className="text-sm">{link.label}</Link>
            ))}
            {note}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {dirty && <span className="text-accent">{t.unsaved}</span>}
            {!dirty && saved && <span className="text-ink-muted">{t.saved}</span>}
            <UndoMenu locale={locale} entries={undo} onPick={onUndo} loading={undoLoading} />
            <Button type="button" variant="primary" onClick={onSave} disabled={saving}>
              {saving ? t.saving : t.save}
            </Button>
          </div>
        </div>
        <PresenceLine locale={locale} path={presencePath} initial={presence} />
        {children}
      </Stack>
    </div>
  )
}

/**
 * The three ways a save comes back, whatever was saved.
 *
 * The two screens post different documents to different actions, but a save is
 * accepted, refused for what it said, or refused because somebody else got
 * there first — and the third carries the version that won so that the screen
 * can work out where it now disagrees.
 */
export type DraftAnswer<T>
  = | { status: "saved", revision: number }
    | { status: "invalid", problems: FieldProblem[] }
    | { status: "conflict", revision: number, current: T }

/** What a screen has to say about the shape it edits, and nothing more. */
export interface DraftEditingOptions<T> {
  /** What the server holds now, which is where the form starts. */
  initial: T
  /**
   * The revision the next save is checked against. **Null is a value here**: a
   * dataset entry is inserted the first time a draft writes one, so there is
   * nothing to check against until it has been saved once. Nothing in this hook
   * reads it — it is carried to the server and compared there.
   */
  revision: number | null
  upstream: UpstreamView<T> | null
  /** Where the two versions of this shape say different things. */
  diff: (base: T, other: T) => string[]
  /** One field of theirs, put into mine. */
  take: (mine: T, theirs: T, path: string) => T
  /** What a save posts besides the revision. */
  body: (value: T) => Record<string, unknown>
  /**
   * This screen's part of a snapshot off the stack, or null when the snapshot
   * holds none — a snapshot from before the draft had touched a dataset has
   * nothing to put back into that dataset's form.
   */
  fromSnapshot: (snapshot: DraftSnapshot) => T | null
  /** Where a snapshot is read from, by its id. */
  undoPath: (undoId: string) => string
  /** What the review layer hangs beside a field, when the screen has one. */
  extraFor?: (path: string) => ReactNode
}

/** What the screen draws from. */
export interface DraftEditing<T> {
  /** What is in the form now. */
  value: T
  /** Replacing it, which is also what makes the screen unsaved. */
  edit: (next: T) => void
  dirty: boolean
  saved: boolean
  saving: boolean
  save: () => void
  /** The version a refused save came back with, and where it disagrees. */
  conflict: { theirs: T, changed: string[] } | null
  upstream: UpstreamView<T> | null
  problems: FieldProblem[]
  /** Taking everything only the other publish touched. */
  takeUpstream: () => void
  marksFor: (path: string) => Marks
  undo: (undoId: string) => void
  undoLoading: boolean
  /** Whether the last snapshot taken off the stack held nothing for this screen. */
  undoMissing: boolean
}

/**
 * Everything an editing screen does between a keystroke and a saved draft.
 *
 * **What is typed is never taken away.** A refused save leaves the form exactly
 * as it was and marks the fields the other version moved; refused markup comes
 * back attached to the field it was written in; a snapshot off the stack is
 * put into the form and left there as unsaved work, which is what keeps going
 * back from being a way around the revision check.
 *
 * The answer is taken while rendering rather than in an effect: it is one state
 * derived from another, not a message to an outside system, and which fields
 * the other version moved has to be worked out against the version this screen
 * still holds — after which that version is replaced.
 *
 * ```tsx
 * const editing = useDraftEditing<DraftInput>({
 *   initial: view.input,
 *   revision: view.revision,
 *   upstream: view.upstream,
 *   diff: diffDraftInput,
 *   take: takeField,
 *   body: (value) => ({ note: value.note, content: value.content }),
 *   fromSnapshot: (snapshot) => ({
 *     note: snapshot.note,
 *     content: researchContentInput(snapshot.content),
 *   }),
 *   undoPath: (undoId) => draftUndoPath(view.researchId, view.draftId, undoId),
 *   extraFor: (path) => <FieldReview review={review} at={path} />,
 * })
 * ```
 */
export function useDraftEditing<T>({
  initial,
  revision: startingRevision,
  upstream: startingUpstream,
  diff,
  take,
  body,
  fromSnapshot,
  undoPath,
  extraFor,
}: DraftEditingOptions<T>): DraftEditing<T> {
  const fetcher = useFetcher<DraftAnswer<T>>()
  const undoFetcher = useFetcher<DraftSnapshot>()

  const [value, setValue] = useState<T>(initial)
  const [base, setBase] = useState<T>(initial)
  const [revision, setRevision] = useState<number | null>(startingRevision)
  const [conflict, setConflict] = useState<{ theirs: T, changed: string[] } | null>(null)
  const [upstream, setUpstream] = useState(startingUpstream)
  const [problems, setProblems] = useState<FieldProblem[]>([])
  const [saved, setSaved] = useState(false)

  // What the pending save carried, so that a success can record it as the
  // version the server now holds without depending on what has been typed since.
  const [sent, setSent] = useState<T>(initial)
  const [answered, setAnswered] = useState<DraftAnswer<T> | null>(null)
  const [restored, setRestored] = useState<DraftSnapshot | null>(null)
  const [undoMissing, setUndoMissing] = useState(false)

  const answer = fetcher.state === "idle" ? fetcher.data : undefined
  if (answer !== undefined && answer !== answered) {
    setAnswered(answer)
    setSaved(answer.status === "saved")
    if (answer.status === "saved") {
      setRevision(answer.revision)
      setBase(sent)
      setConflict(null)
      setProblems([])
    } else if (answer.status === "invalid") {
      setProblems(answer.problems)
    } else {
      setConflict({ theirs: answer.current, changed: diff(base, answer.current) })
      setRevision(answer.revision)
      setBase(answer.current)
      setProblems([])
    }
  }

  const snapshot = undoFetcher.state === "idle" ? undoFetcher.data : undefined
  if (snapshot !== undefined && snapshot !== restored) {
    setRestored(snapshot)
    const held = fromSnapshot(snapshot)
    setUndoMissing(held === null)
    if (held !== null) {
      setValue(held)
      setSaved(false)
      setProblems([])
    }
  }

  function edit(next: T): void {
    setValue(next)
    setSaved(false)
  }

  function save(): void {
    setSent(value)
    // The payload is a plain JSON document. `SubmitTarget` describes one as a
    // type with an index signature, which a named interface never satisfies.
    const payload = { revision, ...body(value) } as unknown as SubmitTarget
    void fetcher.submit(payload, { method: "post", encType: "application/json" })
  }

  /**
   * What both sides touched is left where it is: each of those is a choice, and
   * the mark beside the field is where it is made.
   */
  function takeUpstream(): void {
    if (upstream === null) return
    edit(takeAll(take, value, upstream.theirs, upstream.only))
    setUpstream({ ...upstream, only: [] })
  }

  /**
   * A field can be marked from two directions — a save somebody refused, and a
   * publish that moved what this draft started from. The refusal wins when both
   * apply: it is the more recent of the two.
   */
  function marksFor(path: string): Marks {
    const refused = conflict?.changed.includes(path) ?? false
    const moved = upstream?.both.includes(path) ?? false
    const theirs = refused ? conflict?.theirs : moved ? upstream?.theirs : undefined
    return {
      changed: refused || moved,
      onTake: theirs === undefined
        ? null
        : () => {
            edit(take(value, theirs, path))
            if (!refused && upstream !== null) {
              setUpstream({ ...upstream, both: upstream.both.filter((held) => held !== path) })
            }
          },
      problems: problems.filter((problem) => problem.path.startsWith(`${path}.`)),
      extra: extraFor?.(path),
    }
  }

  return {
    value,
    edit,
    dirty: diff(base, value).length > 0,
    saved,
    saving: fetcher.state !== "idle",
    save,
    conflict,
    upstream,
    problems,
    takeUpstream,
    marksFor,
    undo: (undoId) => { void undoFetcher.load(undoPath(undoId)) },
    undoLoading: undoFetcher.state !== "idle",
    undoMissing,
  }
}
