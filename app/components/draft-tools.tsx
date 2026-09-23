/**
 * What every editing screen of a draft carries, whichever thing it edits.
 *
 * Who else has the draft open is about the draft rather than about the screen,
 * so a research and one of its datasets show the same people. **A dataset
 * editor is an editor of the draft**, and somebody who has one open is somebody
 * to be careful of on the other. `DraftHead`, `DraftTools` and the state behind
 * them are here for the same reason: the two screens differ in what a field
 * is, not in what saving one means.
 */

import { useEffect, useState, type ReactNode } from "react"
import { Link, useFetcher, type SubmitTarget } from "react-router"

import type { FieldProblem } from "~/admin/form.server"
import { takeAll } from "~/admin/merge"
import type { PresenceView, UpstreamView } from "~/admin/pages.server"
import { PRESENCE_HEARTBEAT_SECONDS } from "~/admin/presence"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { AdminBack } from "./admin"
import { Badge, Button, controlFace, Heading, Stack, useDismissible } from "./base"
import { Icon, type IconName } from "./icons"
import { Card } from "./page"
import type { Marks } from "./fields"

/**
 * How tall the tools row is, as the panes under it have to know (`admin.tsx`
 * の `PANE_STANCE`). One row of 36px controls with 12px above and below.
 */
export const TOOLS_HEIGHT = "h-[3.75rem]"

/**
 * Saying we are here, over and over, and showing who else is.
 *
 * The heartbeat answers with the current list, so announcing and finding out
 * are one exchange. Nobody is made read-only by any of it: a save is checked
 * against a revision, and this is only so that two people editing the same
 * thing know about each other before that happens.
 *
 * **It stands beside the save, and always takes its place.** What it tells the
 * person about to save is that the save may meet somebody else's — which is
 * news about the save, and nowhere else on the screen. Drawn only when
 * somebody else is there, it moved everything beside it when they arrived; so
 * the mark and the count stay, and read "0" when the answer is nobody. The
 * names are behind the count, where somebody who wants them can open them.
 */
export function PresenceMark({ locale, path, initial }: {
  locale: Locale
  path: string
  initial: PresenceView[]
}) {
  const t = messagesFor(locale).admin.editor
  const fetcher = useFetcher<{ present: PresenceView[] }>()
  const submit = fetcher.submit
  const box = useDismissible()

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
  if (others.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-ink-muted text-xs" title={t.presenceNobody}>
        <Icon name="users" aria-hidden="true" />
        {t.presence(0)}
        <span className="sr-only">{t.presenceNobody}</span>
      </span>
    )
  }
  return (
    <details ref={box} className="relative">
      <summary
        className={`${controlFace({ size: "xs" })} list-none marker:content-none`}
        title={t.presenceOthers}
      >
        <Icon name="users" aria-hidden="true" />
        {t.presence(others.length)}
      </summary>
      <ul className="absolute top-[calc(100%+0.25rem)] right-0 z-20 min-w-48 rounded border border-line bg-white px-3 py-2 text-sm shadow">
        {others.map((row) => <li key={row.name}>{row.name}</li>)}
      </ul>
    </details>
  )
}

/**
 * The head of an editing screen: what is being edited, the way back out of
 * it, and — for the research editor only — this draft's other faces and its
 * memo.
 *
 * **The first line is the same name row every screen carries** (`Heading`):
 * the role, the identifier beside it, and the way out on the right. An
 * updating draft wears its version as a badge beside the identifier rather
 * than folding it into the name, because it is a fact about the draft's
 * state and not part of what the screen is called
 * (`docs/admin-ui.md` の「画面の名乗り」).
 *
 * **The second line is what this draft is, read once.** Its other three
 * faces, the memo, the comments about the whole of it, and the way to take in
 * a data-providing application — read on the way in and not needed again
 * while typing, which is why it stands here and not in the row that stays
 * (`DraftTools`). A dataset is a part of the draft rather than a face of its
 * own, so its screen carries no second line
 * (`docs/admin-ui.md` の「編集画面」).
 */
export function DraftHead({ locale, title, aside, updating, badge, back, headExtra, overview }: {
  locale: Locale
  title: string
  aside?: string
  /** The version this draft stands in for, when it does. */
  updating: number | null
  /**
   * A mark beside the identifier for a fact only one screen has — the dataset
   * editor's "未公開" — beside the one every draft can carry
   * (`updating`).
   */
  badge?: ReactNode
  /** Where leaving this screen goes (`admin.tsx` の `AdminBack`). */
  back: { to: string, label: string, icon: IconName }
  /**
   * What else stands in the name row after the way out — a document's slug
   * editor, the container's own delete
   * (`docs/admin-ui.md` の「画面の名乗り」の「名前の右に並ぶものの順」). The
   * research editor has neither, so its own call leaves this out.
   */
  headExtra?: ReactNode
  /** This draft's other faces and its memo — the research editor's own. */
  overview?: ReactNode
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <Card under={false}>
      <Stack>
        <Heading
          title={title}
          aside={aside}
          badge={(
            <>
              {updating !== null && (
                <Badge tone="accent" icon={<Icon name="edit" aria-hidden="true" />}>
                  {t.updatingBadge(`v${updating}`)}
                </Badge>
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
    </Card>
  )
}

/**
 * The row an editing screen keeps at hand: the pane switch, unresolved
 * comments, who else is here, and the way to save.
 *
 * **It, and only it, stays at the top of the window.** The screens it serves
 * are thousands of pixels long, and a save that scrolled away with the head
 * was off the screen for most of the time anything was being typed (measured:
 * gone after 306px). The panes below stick under it (`admin.tsx` の
 * `PANE_STANCE`). **Drawn as the head's own last row** — white, the same
 * left and right margin, rounded at the bottom — it reads as one card until
 * the head scrolls out from under it, at which point it is what is left.
 *
 * **Ctrl+S and Cmd+S save.** The hands typing are on the keyboard, and what the
 * browser offers for that chord — saving the page as a file — is nothing anyone
 * on this screen wants.
 */
export function DraftTools({
  locale,
  panesControl,
  unresolved,
  reviewHref,
  dirty,
  saved,
  saving,
  onSave,
  presencePath,
  presence,
}: {
  locale: Locale
  /** The pane arrangement's own switch (`admin.tsx` の `usePanes`). */
  panesControl: ReactNode
  /** Comments nobody has closed yet. */
  unresolved: number
  /** Where the count leads: the review screen, so a curator can read what they are. */
  reviewHref: string
  dirty: boolean
  saved: boolean
  saving: boolean
  onSave: () => void
  presencePath: string
  presence: PresenceView[]
}) {
  const t = messagesFor(locale).admin

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
    <div className={`sticky top-0 z-30 flex ${TOOLS_HEIGHT} items-center gap-4 rounded-b bg-white px-6`}>
      {/* **How the panes are arranged is about the boxes below, not about the
          draft** — it stands first, beside nothing it acts on. */}
      {panesControl}
      {/* **The count is a way to the screen that reads them all.** A curator
          picking it out here does not need to know which field yet — the
          review screen lists them, each beside its place. */}
      <Link to={reviewHref} className="no-underline">
        <Badge tone={unresolved > 0 ? "accent" : undefined} icon={<Icon name="comment" aria-hidden="true" />}>
          {t.detail.openComments(unresolved)}
        </Badge>
      </Link>
      {/*
        **Who else is here, and what to do with the work, at the far end.**
        The two are one group: the first says what the second may run into.
      */}
      <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap text-sm">
        <PresenceMark locale={locale} path={presencePath} initial={presence} />
        {/*
          **The one control that carries the accent, and only while there is
          something to save.** The colour says there is unsaved work and the
          disabled state says there is not — but neither reaches somebody
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
          cannot find again, and the three things this says — there is
          unsaved work, it is being written, it is written — are one piece
          of news that assistive tech should hear as it changes
          (`docs/ui.md` の「壊れるもの」).
        */}
        <span role="status">
          {saving && <span className="text-ink-muted">{t.editor.saving}</span>}
          {!saving && dirty && <span className="text-accent">{t.editor.unsaved}</span>}
          {!saving && !dirty && saved && <span className="text-ink-muted">{t.editor.saved}</span>}
        </span>
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
 * Refusing markup is the save's job and it says where the problem is; the
 * drawing answers with nothing rather than with half a page, and comes back as
 * soon as the prose parses again.
 *
 * **Both languages are drawn, not the one being looked at.** Which pane holds
 * which page is the reader's own arrangement and both can hold one at once, so
 * a drawing that waited to be looked at would arrive after the look.
 */
export function useDrawn<T>(at: string, body: string, initial: T | null): T | null {
  // The fetcher is typed by what the route answers with; a generic one cannot
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
}

/**
 * Everything an editing screen does between a keystroke and a saved draft.
 *
 * **What is typed is never taken away.** A refused save leaves the form exactly
 * as it was and marks the fields the other version moved, and refused markup
 * comes back attached to the field it was written in. Nothing here replaces
 * what is in the form — the only way back to an earlier state is the other
 * version, taken field by field.
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
 *   body: (value) => ({ content: value.content }),
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
  extraFor,
}: DraftEditingOptions<T>): DraftEditing<T> {
  const fetcher = useFetcher<DraftAnswer<T>>()

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

  /** Every difference at once. Each is equally a choice, so none is held back. */
  function takeUpstream(): void {
    if (upstream === null) return
    edit(takeAll(take, value, upstream.theirs, upstream.differing))
    setUpstream({ ...upstream, differing: [] })
  }

  /**
   * A field can be marked from two directions — a save somebody refused, and a
   * difference from the version being compared against. The refusal wins when
   * both apply: it is the more recent of the two.
   */
  function marksFor(path: string): Marks {
    const refused = conflict?.changed.includes(path) ?? false
    const differs = upstream?.differing.includes(path) ?? false
    const theirs = refused ? conflict?.theirs : differs ? upstream?.theirs : undefined
    return {
      at: path,
      changed: refused || differs,
      onTake: theirs === undefined
        ? null
        : () => {
            edit(take(value, theirs, path))
            if (!refused && upstream !== null) {
              setUpstream({
                ...upstream,
                differing: upstream.differing.filter((held) => held !== path),
              })
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
  }
}
