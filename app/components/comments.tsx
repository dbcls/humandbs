/**
 * A conversation about one place, drawn the same way wherever it appears.
 *
 * The preview, the review screen and the editing screens all show the same
 * thing, and they differ in two ways only: where the form posts, and whether
 * the reader may resolve. The preview posts to the page it is on and gets a
 * redirect back, so it works with JavaScript switched off; an editing screen
 * posts to a resource route that answers with the comments, because it is
 * holding unsaved work and must not navigate.
 *
 * **The comments at one place are a flat timeline**: oldest first, one box to
 * write the next one under them, and each resolved on its own. There is no
 * reply — at a place the size of a field, a second conversation would only ask
 * which one to write in (docs/editing.md の「レビュー」).
 *
 * **A comment is signed.** Signing in fills the name from the account; a reader
 * who has not signed in types one, and it is kept in `sessionStorage` rather
 * than `localStorage` so a shared machine does not hand the next person the
 * previous one's name.
 */

import { useState, useSyncExternalStore } from "react"
import { useFetcher } from "react-router"

import { Badge, Button, controlFace, Dialog, Note, Stack } from "~/components/base"
import { CONTROL } from "~/components/form"
import { Icon } from "~/components/icons"
import { minuteInJst } from "~/dates"
import { isFieldAnchor, type AnchorSubject } from "~/review/anchors"
import { unresolvedCount, type CommentView } from "~/review/comments"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

const NAME_KEY = "humandbs.review.name"

/** Everything the places on one page share. */
export interface CommentContext {
  locale: Locale
  /** Where the forms post. */
  action: string
  /** What is being commented on — a subject, the draft as a whole, or the administrators' memo. */
  subject: AnchorSubject | "draft" | "memo"
  /** Only an administrator resolves; a link holder reads and answers. */
  canResolve: boolean
  /** The name comments will be signed with, when the reader is signed in. */
  signedInName: string | null
}

type Answer
  = | { status: "comments", comments: CommentView[] }
    | { status: "invalid", problem: string }

function nameStore(): string {
  try {
    return sessionStorage.getItem(NAME_KEY) ?? ""
  } catch {
    return ""
  }
}

function detach(): void {
  // Nothing to detach: the value only changes through `rememberName` below.
}

function subscribe(): () => void {
  return detach
}

/**
 * The name a reader who has not signed in last typed, for this session. Read
 * through the store so that server and client render the same empty string
 * first and the remembered value only after hydration.
 */
export function useRememberedName(): string {
  return useSyncExternalStore(subscribe, nameStore, () => "")
}

export function rememberName(name: string): void {
  try {
    sessionStorage.setItem(NAME_KEY, name)
  } catch {
    // A browser that refuses storage still posts comments; it just forgets.
  }
}

/**
 * The mark for a comment or an acknowledgement recorded through a DDBJ
 * account.
 *
 * **Shared by every place that draws one**, so the accessible name cannot
 * drift between them the way it had: an `aria-label` and a `title` say the
 * same thing to a screen reader and to a pointer, where the glyph alone says
 * neither.
 */
export function DdbjMark({ locale }: { locale: Locale }) {
  const t = messagesFor(locale).comment
  return (
    <span aria-label={t.ddbjAccount} title={t.ddbjAccount} className="ml-1">
      🅳
    </span>
  )
}

type Fetcher = ReturnType<typeof useFetcher<Answer>>

/** What the last answer holds for a place, and until one comes, what the loader gave. */
function shownOf(
  answer: Answer | undefined,
  given: readonly CommentView[],
  pick: (one: CommentView) => boolean,
): CommentView[] {
  return answer?.status === "comments" ? answer.comments.filter(pick) : [...given]
}

function problemText(locale: Locale, problem: string): string {
  const t = messagesFor(locale).comment
  if (problem === "name-required") return t.nameRequired
  return problem === "body-required" ? t.bodyRequired : t.tooLong
}

/**
 * The mark beside a place: how many people have said something about it
 * (coloured if any of it is unresolved), and the way to open the panel that
 * reads, writes and resolves it (`docs/admin-ui.md` の「コメントの面」).
 */
export function CommentSpot({ context, at, comments, fieldLabel }: {
  context: CommentContext
  at: string
  comments: readonly CommentView[]
  /**
   * The field's own name, for the panel's heading. **Absent where the caller
   * has none to give** — this and `Marks` (`preview.tsx`) know only the path,
   * and a name has to be threaded down from whatever built the screen around
   * them. Until one is, the panel says only "コメント".
   */
  fieldLabel?: string
}) {
  const t = messagesFor(context.locale).comment
  const fetcher = useFetcher<Answer>()
  const shown = shownOf(fetcher.data, comments, (one) => isFieldAnchor(one.anchor) && one.anchor.path === at)
  const open = unresolvedCount(shown)
  const [held, setHeld] = useState(false)
  // Repeated rather than held in a variable: the rule that a panel's title
  // names a word from `messages` reads the attribute's own text, and a
  // variable's name would hide the `t.` it looks for.
  const heading = fieldLabel === undefined ? t.heading : t.fieldHeading(fieldLabel)

  return (
    <span id={encodeURIComponent(at)} className="inline-flex align-top">
      <button
        type="button"
        onClick={() => { setHeld(true) }}
        title={heading}
        className={`${controlFace({ size: "xs" })} min-h-tap min-w-tap`}
      >
        <Icon name="comment" aria-hidden="true" />
        <span className="sr-only">{heading}</span>
        {shown.length > 0 && <span className={open > 0 ? "text-accent" : ""}>{t.count(shown.length)}</span>}
      </button>
      <Dialog
        title={fieldLabel === undefined ? t.heading : t.fieldHeading(fieldLabel)}
        held={{ open: held, close: () => { setHeld(false) } }}
        dismiss={t.close}
      >
        <CommentTimeline context={context} comments={shown} at={at} fetcher={fetcher} placeholder={t.bodyPlaceholder} />
      </Dialog>
    </span>
  )
}

/**
 * What was said at one place, in the order it was said, and the box for the
 * next thing. The list screen draws rows on its own (`CommentRow`); everything
 * else draws the timeline whole.
 */
export function CommentTimeline({ context, comments, at, fetcher, placeholder, empty }: {
  context: CommentContext
  comments: readonly CommentView[]
  /** The place, so a redirect can come back to it. Absent where the page is the place. */
  at?: string
  fetcher?: Fetcher
  placeholder: string
  /** What stands where the list would, while nothing has been said. */
  empty?: string
}) {
  const own = useFetcher<Answer>()
  const post = fetcher ?? own
  const answer = post.data

  return (
    <Stack gap="normal">
      {comments.length === 0 && empty !== undefined && <Note kind="plain">{empty}</Note>}
      {comments.length > 0 && (
        <Stack as="ul" gap="normal">
          {comments.map((one) => (
            <li key={one.id}>
              <CommentRow context={context} comment={one} at={at} fetcher={post} />
            </li>
          ))}
        </Stack>
      )}
      <CommentForm context={context} at={at} fetcher={post} placeholder={placeholder} />
      {answer?.status === "invalid" && (
        <Note kind="danger" live>{problemText(context.locale, answer.problem)}</Note>
      )}
    </Stack>
  )
}

/**
 * One comment: who said it, when, what, and whether it is dealt with.
 *
 * **A line of the memo carries no state**: it is a note rather than a question,
 * so it is neither open nor resolved and offers nothing to press.
 */
export function CommentRow({ context, comment, at, fetcher }: {
  context: CommentContext
  comment: CommentView
  /** The place, so a redirect can come back to it. Absent on a list screen. */
  at?: string
  fetcher?: Fetcher
}) {
  const t = messagesFor(context.locale).comment
  const own = useFetcher<Answer>()
  const post = fetcher ?? own
  const question = comment.anchor.kind !== "memo"

  return (
    // A rule above rather than below: the caller holds comments in a
    // `Stack`, which already puts a gap between them, and a rule on both
    // sides of that gap would draw it twice.
    <div className="border-line border-t pt-2">
      <Stack gap="tight">
        <div className="flex flex-wrap items-baseline gap-2 text-ink-muted text-xs">
          <span className="font-semibold text-ink">{comment.authorName}</span>
          {comment.bySignedIn && <DdbjMark locale={context.locale} />}
          <span>{minuteInJst(comment.createdAt)}</span>
          {question && (comment.resolved
            ? (
                <Badge>
                  {comment.resolvedBy === null ? t.resolved : t.resolvedBy(comment.resolvedBy)}
                  {/* The date only: the hour a comment was closed answers nothing. */}
                  {comment.resolvedAt !== null && ` (${comment.resolvedAt.slice(0, 10)})`}
                </Badge>
              )
            : <span className="text-accent">{t.unresolved}</span>)}
          {question && context.canResolve && (
            <post.Form method="post" action={context.action} className="inline">
              <input type="hidden" name="intent" value={comment.resolved ? "reopen" : "resolve"} />
              <input type="hidden" name="commentId" value={comment.id} />
              {at !== undefined && <input type="hidden" name="at" value={at} />}
              <Button type="submit" variant="ghost" size="xs">
                {comment.resolved ? t.reopen : t.resolve}
              </Button>
            </post.Form>
          )}
        </div>
        <p className="whitespace-pre-wrap text-ink text-sm">{comment.body}</p>
      </Stack>
    </div>
  )
}

/**
 * Writing something. The name box is there for a reader who has not signed in;
 * for one who has, the account's name is what the server signs with and the box
 * would be a second answer to the same question.
 */
export function CommentForm({ context, at, fetcher, placeholder }: {
  context: CommentContext
  at?: string
  fetcher: Fetcher
  placeholder: string
}) {
  const t = messagesFor(context.locale).comment
  const remembered = useRememberedName()
  const busy = fetcher.state !== "idle"
  const subject = context.subject

  return (
    <fetcher.Form
      method="post"
      action={context.action}
      onSubmit={(event) => {
        const typed = new FormData(event.currentTarget).get("name")
        if (typeof typed === "string" && typed.trim() !== "") rememberName(typed.trim())
      }}
    >
      <Stack gap="normal">
        <input type="hidden" name="intent" value="comment" />
        <input type="hidden" name="subject" value={typeof subject === "string" ? subject : subject.kind} />
        {/* The draft as a whole and the memo name no place, so they post no path. */}
        {typeof subject !== "string" && <input type="hidden" name="path" value={at ?? ""} />}
        {typeof subject !== "string" && subject.kind === "dataset" && (
          <input type="hidden" name="datasetId" value={subject.datasetId} />
        )}
        {at !== undefined && <input type="hidden" name="at" value={at} />}

        {context.signedInName === null && (
          <input
            type="text"
            name="name"
            key={remembered}
            defaultValue={remembered}
            placeholder={messagesFor(context.locale).preview.whoPlaceholder}
            aria-label={messagesFor(context.locale).preview.who}
            className={`${CONTROL} text-sm`}
          />
        )}
        <textarea
          name="body"
          rows={2}
          placeholder={placeholder}
          aria-label={t.body}
          className={`${CONTROL} text-sm`}
        />
        {/* **The button keeps its name while it works.** What it is doing is
            said beside it, where assistive tech hears it as news rather than as
            the control changing identity (`docs/ui.md` の「壊れるもの」). */}
        <div className="flex items-center gap-2">
          <Button type="submit" size="xs" disabled={busy}>{t.post}</Button>
          <span role="status" className="text-ink-muted text-xs">{busy ? t.posting : ""}</span>
        </div>
      </Stack>
    </fetcher.Form>
  )
}

/**
 * The draft's memo — what administrators keep among themselves about the work.
 *
 * **It is a timeline rather than a box.** A draft stays open for as long as it
 * takes to settle a version, and more than one curator writes in it: what is
 * worth keeping is who said what and when, which a single field everybody
 * overwrites cannot hold. **It is not a question**: nothing in it is resolved
 * or counted as open.
 *
 * **Nobody outside the management area sees it.** A share link neither shows
 * these lines nor accepts one — what the provider is asked about is attached
 * to the field it is about, or said to the draft as a whole (`WholeNote`).
 *
 * **The entry is a `Button`; what it opens is a panel** (`docs/admin-ui.md` の
 * 「コメントの面」) — the same panel a field's own mark opens, so reading,
 * writing and resolving are learned once.
 */
export function DraftNote({ context, comments }: {
  context: CommentContext
  comments: readonly CommentView[]
}) {
  const t = messagesFor(context.locale).admin.editor
  const fetcher = useFetcher<Answer>()
  const shown = shownOf(fetcher.data, comments, (one) => one.anchor.kind === "memo")
  const open = unresolvedCount(shown)
  const [held, setHeld] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        icon={<Icon name="comment" aria-hidden="true" />}
        onClick={() => { setHeld(true) }}
      >
        {t.memo}
        {shown.length > 0 && <Badge tone={open > 0 ? "accent" : undefined}>{shown.length}</Badge>}
      </Button>
      <Dialog
        title={t.memo}
        note={t.memoHint}
        held={{ open: held, close: () => { setHeld(false) } }}
        dismiss={messagesFor(context.locale).comment.close}
      >
        <CommentTimeline
          context={{ ...context, subject: "memo" }}
          comments={shown}
          fetcher={fetcher}
          placeholder={t.memoEmpty}
          empty={t.memoEmpty}
        />
      </Dialog>
    </>
  )
}

/**
 * What has been said about the draft as a whole, as the editing screen shows
 * it. The same timeline the share link shows at the head of the preview, so a
 * provider's remark about the research and the office's answer stand in one
 * place for both.
 *
 * **The entry is a `Button`; what it opens is a panel**, the same one
 * `DraftNote`'s does (`docs/admin-ui.md` の「コメントの面」).
 */
export function WholeNote({ context, comments }: {
  context: CommentContext
  comments: readonly CommentView[]
}) {
  const t = messagesFor(context.locale).admin.editor
  const fetcher = useFetcher<Answer>()
  const shown = shownOf(fetcher.data, comments, (one) => one.anchor.kind === "draft")
  const open = unresolvedCount(shown)
  const [held, setHeld] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        icon={<Icon name="comment" aria-hidden="true" />}
        onClick={() => { setHeld(true) }}
      >
        {t.whole}
        {shown.length > 0 && <Badge tone={open > 0 ? "accent" : undefined}>{shown.length}</Badge>}
      </Button>
      <Dialog
        title={t.whole}
        note={t.wholeHint}
        held={{ open: held, close: () => { setHeld(false) } }}
        dismiss={messagesFor(context.locale).comment.close}
      >
        <CommentTimeline
          context={{ ...context, subject: "draft" }}
          comments={shown}
          fetcher={fetcher}
          placeholder={messagesFor(context.locale).preview.wholePlaceholder}
          empty={t.wholeEmpty}
        />
      </Dialog>
    </>
  )
}
