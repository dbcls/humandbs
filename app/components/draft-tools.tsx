/**
 * What every editing screen of a draft has, whichever thing it edits.
 *
 * **A dataset editor is an editor of the draft.** `DraftHead`, `DraftTools`
 * and the state behind them are shared for that reason: the two screens
 * differ in what a field is, not in what saving one means.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useFetcher, type SubmitTarget } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { useHoldsUnsaved } from "~/components/unsaved"

import { AdminBack } from "./admin"
import { Button, Heading, Stack } from "./base"
import { Icon, type IconName } from "./icons"
import type { FieldAnnotations } from "./fields"
import { SaveNews } from "./form"
import { Flag } from "./flags"

/**
 * The header of an editing screen: what is being edited, the back link out of
 * it, and — for the research editor only — this draft's other screens and its
 * memo.
 *
 * **The first line is the same name row every screen has** (`Heading`):
 * the role, the identifier beside it, and the back link on the right. An
 * updating draft is shown with its version as a badge beside the identifier rather
 * than merging it into the name, because it is a fact about the draft's
 * state and not part of what the screen is called.
 *
 * **The second line is what this draft is, read once.** Its other three
 * screens, the memo, the comments about the whole of it, and the link to import
 * a data-providing application — read on the way in and not needed again
 * while typing, which is why it collapses away with the name. A dataset is a part
 * of the draft rather than a screen of its own, so its screen has no second
 * line.
 *
 * **The last row is the toolbar, and it is the one row that stays.** The
 * card sticks to the top of the window; once it is held there, the name and
 * the second line collapse away and the toolbar is what is left — one 36px row
 * with 12px above and below (3.75rem), which is what the panes under it add
 * up from (`admin.tsx` の `PANE_STANCE`). The screens are thousands of pixels
 * long, and a save that scrolled away with the header was off the screen for
 * most of the time anything was typed (measured: gone after 306px). **Collapsed
 * rather than a row of its own**: a row shown apart from the header read as
 * a card with one line in it.
 */
export function DraftHead({ locale, title, aside, updating, badge, back, headExtra, overview, tools }: {
  locale: Locale
  title: string
  aside?: string
  /** The version this draft stands in for, when it does. */
  updating: number | null
  /**
   * An indicator beside the identifier for a fact only one screen has — the dataset
   * editor's "未公開" — beside the one every draft can have
   * (`updating`).
   */
  badge?: ReactNode
  /** Where leaving this screen goes (`admin.tsx` の `AdminBack`). */
  back: { to: string, label: string, icon: IconName }
  /**
   * What else is shown in the name row after the back link — a document's slug
   * editor, the container's own delete. The research editor has neither, so
   * its own call leaves this out.
   */
  headExtra?: ReactNode
  /** This draft's other screens and its memo — the research editor's own. */
  overview?: ReactNode
  /**
   * What stays in reach while typing — the pane switch and the way to save
   * (`DraftTools`, `contents.tsx` の `ArticleTools`). Once the page is
   * scrolled, the card is collapsed down to this one row.
   */
  tools: ReactNode
}) {
  const t = messagesFor(locale).admin.editor
  const card = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  // **Collapsed once the card is held at the top of the window.** The card stays
  // at the top once scrolled to; the observer sees it stop being wholly inside
  // a root shrunk by 1px at the top, which is exactly when its top edge has
  // met the window's.
  // A card cut off at the bottom (a short window) is not held, so the top
  // edge is asked as well. Without script the card stays open and sticks at
  // its full height.
  useEffect(() => {
    const el = card.current
    if (el === null) return
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry === undefined) return
      setCollapsed(entry.intersectionRatio < 1 && entry.boundingClientRect.top < 1)
    }, { threshold: [1], rootMargin: "-1px 0px 0px 0px" })
    watcher.observe(el)
    return () => {
      watcher.disconnect()
    }
  }, [])

  return (
    <div
      ref={card}
      // **Under the strip that responds to an operation** (`base.tsx` の `Toast`,
      // z-30): the card is held at the top of the window, which is where the
      // answer floats, and the answer is the newer of the two.
      className={`sticky top-0 z-20 bg-white motion-safe:transition-[padding] motion-safe:duration-150 ${
        collapsed ? "rounded-b py-3" : "rounded py-6"
      }`}
    >
      {/* **The name and the facts collapse away; the tools stay.** Collapsing is a
          grid track going to nothing, which needs no measured height. What is
          collapsed is also inert, so neither focus nor a reader lands in it.
          **The card's side padding is the collapsing box's own**, so that the
          name's rule, which reaches out to the card's edge, is clipped at the
          edge and not at the padding. */}
      <div
        className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-150 ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden px-6" inert={collapsed}>
          <Stack>
            <Heading
              title={title}
              aside={aside}
              badge={(
                <>
                  {updating !== null && (
                    <Flag kind="changed">{t.updatingBadge(`v${updating}`)}</Flag>
                  )}
                  {badge}
                </>
              )}
            >
              <AdminBack to={back.to} label={back.label} icon={back.icon} />
              {headExtra}
            </Heading>
            {overview}
          </Stack>
          <div className="h-4" />
        </div>
      </div>
      <div className="px-6">{tools}</div>
    </div>
  )
}

/**
 * The row an editing screen keeps at hand, as the header's last row
 * (`DraftHead`): the way to save, what the save is doing, the panels read
 * while typing (the memo, the whole, what is still open), and — at the far
 * end — the pane switch.
 *
 * **Save is shown first, alone.** It is the one thing on the row that has to be
 * pressed, so it is where the eye starts, with its news to its right. **The
 * panels' entries and the switch are shown together at the far end**, the switch
 * last: none of them changes the draft.
 *
 * **Ctrl+S and Cmd+S save.** The hands typing are on the keyboard, and what the
 * browser offers for that chord — saving the page as a file — is nothing anyone
 * on this screen wants.
 */
export function DraftTools({
  locale,
  panesControl,
  notes,
  dirty,
  saved,
  saving,
  onSave,
}: {
  locale: Locale
  /** The pane arrangement's own switch (`admin.tsx` の `usePanes`). */
  panesControl: ReactNode
  /** The entries of the panels read while typing (`comments.tsx` の `DraftNote` / `WholeNote` / `OpenComments`). */
  notes: ReactNode
  dirty: boolean
  saved: boolean
  saving: boolean
  onSave: () => void
}) {
  const t = messagesFor(locale).admin

  // The guard at the way off the screen hears this screen's own answer
  // (`unsaved.tsx`); saving here goes through a fetcher, which is not a way
  // off and is never stopped.
  useHoldsUnsaved(dirty)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "s" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      if (dirty && !saving) onSave()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
    }
  }, [dirty, saving, onSave])

  return (
    // **One line where the window allows, and a second line rather than a
    // squeeze where it does not.** The entries are words in boxes, and a box
    // whose word is collapsed onto two lines is taller than the row and reads as
    // broken; so nothing here collapses inside itself, and a narrow window sends
    // the pane switch — the last thing, at the far end — down to a line of
    // its own instead.
    <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
      {/*
        **Save is shown first, at the row's left, with its news beside it.** The
        two are one group: what to do with the work, and what the save is doing.
      */}
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-sm">
        {/*
          **The one control that has the accent, and only while there is
          something to save.** The colour shows there is unsaved work and the
          disabled state shows there is not — but neither reaches somebody
          who is not looking at it, so the words beside it stay.
        */}
        <Button
          type="button"
          variant="accent"
          onClick={onSave}
          disabled={!dirty || saving}
          icon={<Icon name="save" aria-hidden="true" />}
        >
          {t.editor.save}
        </Button>
        {/*
          **What the save is doing is said here and not on the button.** A
          control that renames itself while it works is a control the reader
          cannot find again, and the three things this shows — there is
          unsaved work, it is being written, it is written — are one piece
          of news that assistive tech should hear as it changes.
        */}
        <SaveNews
          words={[t.editor.saving, t.editor.unsaved, t.editor.saved]}
          said={saving
            ? { word: t.editor.saving, tone: "muted" }
            : dirty
              ? { word: t.editor.unsaved, tone: "accent" }
              : saved ? { word: t.editor.saved, tone: "muted" } : null}
        />
      </div>
      {/*
        **Everything else is one group at the right end.** None of it changes
        the draft: the entries open what is read while typing, in panels over
        the form, and the switch arranges the boxes below. Set beside save they
        read as more of what save is; set with the switch, save stands alone.
        The group wraps as a whole, so a narrow window sends it down together.
      */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <span className="flex flex-wrap items-center gap-4 whitespace-nowrap">{notes}</span>
        {/* **The pane switch is shown last** — it is about the boxes below, not
            about the draft. */}
        {panesControl}
      </div>
    </div>
  )
}

/** How long the keys have to stop before the pane beside the form is redrawn. */
const DRAW_AFTER = 300

/**
 * The pane catching up with what is being typed, in one language.
 *
 * **It waits for the keys to stop.** Drawing the page is a round trip, and one
 * per keystroke would be a request per letter for an answer nobody has time to
 * read; a pause is also when somebody looks up at it.
 *
 * **The same content is not asked for twice.** Moving the caret, or marking a
 * value unsettled and back, leaves the content as it was, and the pane has
 * nothing to redraw.
 *
 * **Prose the tree cannot hold leaves the pane on the page as it was loaded.**
 * Refusing markup is the save's job and it shows where the problem is; the
 * drawing responds with nothing rather than with half a page, and comes back as
 * soon as the prose parses again.
 *
 * **Both languages are drawn, not the one being looked at.** Which pane holds
 * which page is the reader's own arrangement and both can hold one at once, so
 * a drawing that waited to be looked at would arrive after the look.
 */
export function useDrawn<T>(at: string, body: string, initial: T | null): T | null {
  // The fetcher is typed by what the route responds with; a generic one cannot
  // be told that a JSON document survives the trip unchanged.
  const drawing = useFetcher() as { data?: T | null, submit: ReturnType<typeof useFetcher>["submit"] }
  const submit = drawing.submit
  useEffect(() => {
    const waiting = setTimeout(() => {
      void submit(body, { method: "post", action: at, encType: "application/json" })
    }, DRAW_AFTER)
    return () => {
      clearTimeout(waiting)
    }
  }, [body, at, submit])

  return drawing.data ?? initial
}

/**
 * The three ways a save comes back, whatever was saved.
 *
 * The two screens post different documents to different actions, but a save is
 * accepted, refused for what it said, or refused because somebody else got
 * there first — and the third has the version that won so that the screen
 * can work out where it now disagrees.
 */
export type DraftAnswer<T>
  = | { status: "saved", revision: number }
    | { status: "conflict", revision: number, current: T }

/** What a screen has to show about the shape it edits, and nothing more. */
export interface DraftEditingOptions<T> {
  /** What the server holds now, which is where the form starts. */
  initial: T
  /**
   * The revision the next save is checked against. **Null is a value here**: a
   * dataset entry is inserted the first time a draft writes one, so there is
   * nothing to check against until it has been saved once. Nothing in this hook
   * reads it — it is passed to the server and compared there.
   */
  revision: number | null
  /** Where the two versions of this shape say different things. */
  diff: (base: T, other: T) => string[]
  /** One field of theirs, put into mine. */
  importAt: (mine: T, theirs: T, path: string) => T
  /** What a save posts besides the revision. */
  body: (value: T) => Record<string, unknown>
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
  annotationsFor: (path: string) => FieldAnnotations
}

/**
 * Everything an editing screen does between a keystroke and a saved draft.
 *
 * **What is typed is never taken away.** A refused save leaves the form exactly
 * as it was and marks the fields the other version moved, and refused markup
 * comes back attached to the field it was written in. Nothing here replaces
 * what is in the form — the only return to an earlier state is the other
 * version, imported field by field.
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
 *   diff: diffDraftInput,
 *   importAt: importField,
 *   body: (value) => ({ content: value.content }),
 *   extraFor: (path) => <FieldReview review={review} at={path} />,
 * })
 * ```
 */
export function useDraftEditing<T>({
  initial,
  revision: startingRevision,
  diff,
  importAt,
  body,
  extraFor,
}: DraftEditingOptions<T>): DraftEditing<T> {
  const fetcher = useFetcher<DraftAnswer<T>>()

  const [value, setValue] = useState<T>(initial)
  const [base, setBase] = useState<T>(initial)
  const [revision, setRevision] = useState<number | null>(startingRevision)
  const [conflict, setConflict] = useState<{ theirs: T, changed: string[] } | null>(null)
  const [saved, setSaved] = useState(false)

  // What the pending save kept, so that a success can record it as the
  // version the server now holds without depending on what has been typed since.
  const [sent, setSent] = useState<T>(initial)
  const [answered, setAnswered] = useState<DraftAnswer<T> | null>(null)

  const answer = fetcher.state === "idle" ? fetcher.data : undefined
  if (answer !== undefined && answer !== answered) {
    setAnswered(answer)
    setSaved(answer.status === "saved")
    if (answer.status === "saved") {
      setRevision(answer.revision)
      setBase(sent)
      setConflict(null)
    } else {
      setConflict({ theirs: answer.current, changed: diff(base, answer.current) })
      setRevision(answer.revision)
      setBase(answer.current)
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
   * A field is marked when a refused save shows somebody else moved it, and
   * offers their value. **Only a refusal marks the form**: a difference from a
   * version or another draft is imported on its own screen, and read on the
   * page beside the form.
   */
  function annotationsFor(path: string): FieldAnnotations {
    const theirs = conflict?.changed.includes(path) === true ? conflict.theirs : undefined
    return {
      at: path,
      changed: theirs !== undefined,
      onImport: theirs === undefined ? null : () => { edit(importAt(value, theirs, path)) },
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
    annotationsFor,
  }
}
