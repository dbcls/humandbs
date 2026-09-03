/**
 * A conversation about one place, drawn the same way wherever it appears.
 *
 * The preview, the review screen and the editing screens all show the same
 * thing, and they differ in two ways only: where the form posts, and whether
 * the reader may resolve. The preview posts to the page it is on and gets a
 * redirect back, so it works with JavaScript switched off; an editing screen
 * posts to a resource route that answers with the threads, because it is
 * holding unsaved work and must not navigate.
 *
 * **A comment is signed.** Signing in fills the name from the account; a reader
 * who has not signed in types one, and it is kept in `sessionStorage` rather
 * than `localStorage` so a shared machine does not hand the next person the
 * previous one's name.
 */

import { useEffect, useRef, useSyncExternalStore } from "react"
import { useFetcher, useLocation } from "react-router"

import { Badge, Button, Stack } from "~/components/base"
import { CONTROL } from "~/components/form"
import { Icon } from "~/components/icons"
import type { AnchorSubject } from "~/review/anchors"
import { unresolvedCount, type ThreadView } from "~/review/comments"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

const NAME_KEY = "humandbs.review.name"

/** Everything the spots on one page share. */
export interface CommentContext {
  locale: Locale
  /** Where the forms post. */
  action: string
  subject: AnchorSubject
  /** Only an administrator resolves; a link holder reads and answers. */
  canResolve: boolean
  /** The name comments will be signed with, when the reader is signed in. */
  signedInName: string | null
}

type Answer
  = | { status: "threads", threads: ThreadView[] }
    | { status: "invalid", problem: string }

function nameStore(): string {
  try {
    return sessionStorage.getItem(NAME_KEY) ?? ""
  } catch {
    return ""
  }
}

function detach(): void {
  // Nothing to detach: the value only ever changes on this page.
}

function subscribe(): () => void {
  return detach
}

/**
 * The remembered name. It is read through `useSyncExternalStore` so that the
 * server renders an empty box and the browser fills it in after hydration,
 * rather than the two disagreeing about what the markup should be.
 */
export function useRememberedName(): string {
  return useSyncExternalStore(subscribe, nameStore, () => "")
}

export function rememberName(name: string): void {
  if (name === "") return
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

/**
 * The mark beside a place: how many people have said something about it, and
 * the way to say something yourself. Everything is inside a `details`, so
 * nothing about it needs JavaScript to open.
 *
 * **It closes on Escape, on a press anywhere else, and on going somewhere.** A
 * research edit screen carries dozens of these open at once, and a panel that
 * only closes by pressing its own control again stays open over the page while
 * the reader carries on with something else. The two listeners are on the
 * document because the press that should close it is by definition not on this
 * element, and the address is watched because a client-side move does not
 * reload the page — the same three ways every panel that hangs off a control
 * closes (`docs/ui.md`).
 */
export function CommentSpot({ context, at, threads }: {
  context: CommentContext
  at: string
  threads: readonly ThreadView[]
}) {
  const t = messagesFor(context.locale).comment
  const fetcher = useFetcher<Answer>()
  const answer = fetcher.data
  const shown = answer?.status === "threads"
    ? answer.threads.filter((thread) => thread.anchor.path === at)
    : [...threads]
  const open = unresolvedCount(shown)

  const box = useRef<HTMLDetailsElement>(null)
  const { key } = useLocation()

  useEffect(() => {
    if (box.current !== null) box.current.open = false
  }, [key])

  useEffect(() => {
    const element = box.current
    if (element === null) return

    const onPress = (event: PointerEvent) => {
      if (!element.open) return
      if (event.target instanceof Node && element.contains(event.target)) return
      element.open = false
    }
    // Focus goes back to the control that opened it: closing a panel the
    // reader is inside would otherwise leave focus on nothing.
    const onKey = (event: KeyboardEvent) => {
      if (!element.open || event.key !== "Escape") return
      element.open = false
      element.querySelector("summary")?.focus()
    }

    document.addEventListener("pointerdown", onPress)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPress)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  return (
    <details ref={box} className="inline-flex flex-col items-start gap-2 align-top text-sm" id={encodeURIComponent(at)}>
      <summary
        title={shown.length === 0 ? t.add : t.heading}
        className="inline-flex min-h-tap min-w-tap cursor-pointer list-none items-center justify-center gap-1 rounded border border-line-strong px-2 text-ink-muted text-xs marker:content-none hover:bg-surface-hover"
      >
        <Icon name="comment" aria-hidden="true" />
        <span className="sr-only">{shown.length === 0 ? t.add : t.heading}</span>
        {shown.length > 0 && t.count(shown.length)}
        {open > 0 && <span className="text-accent">{t.unresolved}</span>}
      </summary>

      <div className="w-full min-w-64 max-w-xl rounded border border-line bg-surface px-3 py-2">
        <Stack gap="normal">
          {shown.map((thread) => (
            <Thread key={thread.id} context={context} thread={thread} at={at} fetcher={fetcher} />
          ))}
          <CommentForm context={context} at={at} fetcher={fetcher} intent="comment" />
          {answer?.status === "invalid" && (
            <p className="text-danger text-xs">{problemText(context.locale, answer.problem)}</p>
          )}
        </Stack>
      </div>
    </details>
  )
}

function problemText(locale: Locale, problem: string): string {
  const t = messagesFor(locale).comment
  if (problem === "name-required") return t.nameRequired
  return problem === "body-required" ? t.bodyRequired : t.tooLong
}

type Fetcher = ReturnType<typeof useFetcher<Answer>>

/** One thread: what was said, what to say back, and whether it is dealt with. */
export function Thread({ context, thread, at, fetcher }: {
  context: CommentContext
  thread: ThreadView
  /** The place, so a redirect can come back to it. Absent on a list screen. */
  at?: string
  fetcher?: Fetcher
}) {
  const t = messagesFor(context.locale).comment
  const own = useFetcher<Answer>()
  const post = fetcher ?? own

  return (
    // A rule above rather than below: the caller holds threads in a
    // `Stack`, which already puts a gap between them, and a rule on both
    // sides of that gap would draw it twice.
    <div className="border-line border-t pt-2">
      <Stack gap="normal">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {thread.resolved
            ? (
                <Badge>
                  {thread.resolvedBy === null ? t.resolved : t.resolvedBy(thread.resolvedBy)}
                  {/* The date only: the hour a thread was closed answers nothing. */}
                  {thread.resolvedAt !== null && ` (${thread.resolvedAt.slice(0, 10)})`}
                </Badge>
              )
            : <span className="text-accent">{t.unresolved}</span>}
          {context.canResolve && (
            <post.Form method="post" action={context.action} className="inline">
              <input type="hidden" name="intent" value={thread.resolved ? "reopen" : "resolve"} />
              <input type="hidden" name="threadId" value={thread.id} />
              {at !== undefined && <input type="hidden" name="at" value={at} />}
              <Button type="submit" variant="ghost" size="xs">
                {thread.resolved ? t.reopen : t.resolve}
              </Button>
            </post.Form>
          )}
        </div>

        <Stack as="ul" gap="normal">
          {thread.comments.map((comment) => (
            <li key={comment.id}>
              <div className="flex flex-wrap items-baseline gap-2 text-ink-muted text-xs">
                <span className="font-semibold">{comment.authorName}</span>
                {comment.bySignedIn && <DdbjMark locale={context.locale} />}
                <span>{comment.createdAt.slice(0, 16).replace("T", " ")}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
            </li>
          ))}
        </Stack>

        <CommentForm
          context={context}
          at={at}
          fetcher={post}
          intent="reply"
          threadId={thread.id}
        />
      </Stack>
    </div>
  )
}

/**
 * Writing something. The name box is there for a reader who has not signed in;
 * for one who has, the account's name is what the server signs with and the box
 * would be a second answer to the same question.
 */
export function CommentForm({ context, at, fetcher, intent, threadId }: {
  context: CommentContext
  at?: string
  fetcher: Fetcher
  intent: "comment" | "reply"
  threadId?: string
}) {
  const t = messagesFor(context.locale).comment
  const remembered = useRememberedName()
  const busy = fetcher.state !== "idle"

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
        <input type="hidden" name="intent" value={intent} />
        {threadId !== undefined && <input type="hidden" name="threadId" value={threadId} />}
        {intent === "comment" && <input type="hidden" name="path" value={at ?? ""} />}
        {intent === "comment" && <input type="hidden" name="subject" value={context.subject.kind} />}
        {intent === "comment" && context.subject.kind === "dataset" && (
          <input type="hidden" name="datasetId" value={context.subject.datasetId} />
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
          placeholder={intent === "reply" ? t.reply : t.bodyPlaceholder}
          aria-label={t.body}
          className={`${CONTROL} text-sm`}
        />
        <div>
          <Button type="submit" size="xs" disabled={busy}>
            {busy ? t.posting : t.post}
          </Button>
        </div>
      </Stack>
    </fetcher.Form>
  )
}
