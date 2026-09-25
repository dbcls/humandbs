/**
 * A conversation about one place, drawn the same way wherever it appears.
 *
 * The preview, the review screen and the editing screens all show the same
 * thing, and they differ in two ways only: where the form posts, and whether
 * the reader may resolve and delete. The preview posts to the page it is on
 * and gets a redirect back, so it works with JavaScript switched off; an
 * editing screen posts to a resource route that responds with the comments,
 * because it is holding unsaved work and must not navigate.
 *
 * **The comments at one place are a flat timeline**: oldest first, one box to
 * write the next one under them, and each resolved on its own. There is no
 * reply — at a place the size of a field, a second conversation would only ask
 * which one to write in.
 *
 * **A comment is signed.** Signing in fills the name from the account; a reader
 * who has not signed in types one, and it is kept in `sessionStorage` rather
 * than `localStorage` so a shared machine does not hand the next person the
 * previous one's name.
 *
 * **The words on the controls follow the reader.** In the management area what
 * can be pressed is named by a noun; the preview is written for a provider and
 * shows 「投稿する」. Which side a panel is on is
 * what `canResolve` already tells it.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useFetcher } from "react-router"

import { Badge, Button, type ButtonSize, Dialog, PanelButton, Note, Stack } from "~/components/base"
import { CONTROL } from "~/components/form"
import { Icon, type IconName, SUBJECT_ICON } from "~/components/icons"
import { minuteInJst } from "~/dates"
import type { CommentAnchor } from "~/content/types"
import { isFieldAnchor, type AnchorSubject } from "~/review/anchors"
import { unresolvedCount, type CommentView } from "~/review/comments"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { Flag } from "./flags"
import { Empty } from "./page"

const NAME_KEY = "humandbs.review.name"

/** Everything the places on one page share. */
export interface CommentContext {
  locale: Locale
  /** Where the forms post. */
  action: string
  /** What is being commented on — a subject, the draft as a whole, or the administrators' memo. */
  subject: AnchorSubject | "draft" | "memo"
  /** Only an administrator resolves and deletes; a link holder reads and responds. */
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
 * Who said something, as a row draws it: the indicator of a person, then the words.
 *
 * **Every author gets the indicator**, so that a bare word at the head of a row
 * reads as a name and not as a label.
 */
export function Author({ locale, name, bySignedIn }: {
  locale: Locale
  name: string
  bySignedIn: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-ink">
      <Icon name="user" aria-hidden="true" />
      {name}
      {!bySignedIn && (
        <span className="font-normal text-ink-muted">{`(${messagesFor(locale).comment.anonymous})`}</span>
      )}
    </span>
  )
}

type Fetcher = ReturnType<typeof useFetcher<Answer>>

/**
 * Whether the fetcher a panel shares is handling a posting right now. **The
 * one fetcher handles posting, resolving and deleting**, so the form cannot
 * read "busy" off its state alone: resolving a row would then say 投稿中 beside
 * a box nobody has sent, and hold the send button shut while it did.
 */
export function postingInFlight(fetcher: Pick<Fetcher, "state" | "formData">): boolean {
  return fetcher.state !== "idle" && fetcher.formData?.get("intent") === "comment"
}

/** Whether the fetcher is handling a resolve, reopen or delete of this one comment. */
export function actingOn(fetcher: Pick<Fetcher, "state" | "formData">, commentId: string): boolean {
  return fetcher.state !== "idle"
    && fetcher.formData?.get("intent") !== "comment"
    && fetcher.formData?.get("commentId") === commentId
}

/** What the last answer holds for a place, and until one comes, what the loader gave. */
function shownOf(
  answer: Answer | undefined,
  given: readonly CommentView[],
  pick: (one: CommentView) => boolean,
): CommentView[] {
  return answer?.status === "comments" ? answer.comments.filter(pick) : [...given]
}

/** What a refused comment or review press was missing, said the same wherever it was refused. */
export function problemText(locale: Locale, problem: string): string {
  const t = messagesFor(locale).comment
  if (problem === "name-required") return t.nameRequired
  return problem === "body-required" ? t.bodyRequired : t.tooLong
}

/**
 * The indicator beside a place: how many people have said something about it
 * (coloured if any of it is unresolved), and the way to open the panel that
 * reads, writes and resolves it.
 *
 * **Drawn at the height of a line of text, with the 36px target kept out of
 * sight.** What is shown beside it is a heading or a value — the thing it is
 * about — and a box the size of its subject reads as the larger of the two.
 * The style is `row` (22px); what a finger has to find is widened past the
 * style by a pseudo-element, so the line the indicator is shown in keeps its own
 * height.
 */
export function CommentSpot({ context, at, comments, fieldLabel }: {
  context: CommentContext
  at: string
  comments: readonly CommentView[]
  /**
   * The field's own name, for the panel's heading. **Absent where the caller
   * has none to give** — this and `FieldAnnotations` (`preview.tsx`) know only the path,
   * and a name has to be threaded down from whatever built the screen around
   * them. Until one is, the panel shows only "コメント".
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
      <PanelButton icon="comment" label={heading} onClick={() => { setHeld(true) }}>
        {shown.length > 0 && <span className={open > 0 ? "text-accent" : ""}>{t.count(shown.length)}</span>}
      </PanelButton>
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
  /** What is shown where the list would, while nothing has been said. */
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
 * One comment: who said it, when, what, and whether it is dealt with — and,
 * for an administrator, the two things to do about it at the row's right end.
 *
 * **A line of the memo has no state**: it is a note rather than a question,
 * so it is neither open nor resolved and offers nothing to resolve. It can
 * still be deleted.
 *
 * **Deleting is not asked about.** The row is already shown in a panel, and a
 * panel over a panel leaves the reader responding to two questions at once; what
 * goes is one line whose words they have just read. The trigger is shown with the
 * warning style all the same, since there is no way to press it back.
 */
export function CommentRow({ context, comment, at, fetcher }: {
  context: CommentContext
  comment: CommentView
  /** The place, so a redirect can come back to it. Absent on a list screen. */
  at?: string
  fetcher?: Fetcher
}) {
  const t = messagesFor(context.locale).comment
  const words = messagesFor(context.locale).admin.comment
  const own = useFetcher<Answer>()
  const post = fetcher ?? own
  const question = comment.anchor.kind !== "memo"
  // Only this row's own action shuts its controls: the fetcher is shared, and a
  // posting or another row's resolving is not this row's business.
  const acting = actingOn(post, comment.id)

  return (
    // A rule above rather than below: the caller holds comments in a
    // `Stack`, which already puts a gap between them, and a rule on both
    // sides of that gap would draw it twice.
    <div className="border-line border-t pt-2">
      <Stack gap="tight">
        <div className="flex flex-wrap items-center gap-2 text-ink-muted text-xs">
          <Author locale={context.locale} name={comment.authorName} bySignedIn={comment.bySignedIn} />
          <span>{minuteInJst(comment.createdAt)}</span>
          {/* The state alone: who closed it and when is on record, but a
              badge that recites it is a sentence in a row of icons. */}
          {question && <Flag kind={comment.resolved ? "resolved" : "unresolved"}>{comment.resolved ? t.resolved : t.unresolved}</Flag>}
          {context.canResolve && (
            <span className="ml-auto flex items-center gap-2">
              {question && (
                <post.Form method="post" action={context.action}>
                  <input type="hidden" name="intent" value={comment.resolved ? "reopen" : "resolve"} />
                  <input type="hidden" name="commentId" value={comment.id} />
                  {at !== undefined && <input type="hidden" name="at" value={at} />}
                  <Button
                    type="submit"
                    size="xs"
                    icon={<Icon name={comment.resolved ? "undo" : "check"} aria-hidden="true" />}
                    disabled={acting}
                  >
                    {comment.resolved ? words.reopen : words.resolve}
                  </Button>
                </post.Form>
              )}
              <post.Form method="post" action={context.action}>
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="commentId" value={comment.id} />
                {at !== undefined && <input type="hidden" name="at" value={at} />}
                <Button type="submit" variant="danger" size="xs" icon={<Icon name="trash" aria-hidden="true" />} disabled={acting}>
                  {words.remove}
                </Button>
              </post.Form>
              {/* The buttons keep their names while the row works; what is
                  happening is said beside them, out of sight (`Submit` does
                  the same). */}
              <span role="status" className="sr-only">{acting ? messagesFor(context.locale).admin.busy : ""}</span>
            </span>
          )}
        </div>
        {/* Set in from the edge by the width of the person's icon, so the words
            start under the name rather than under the glyph before it. */}
        <p className="whitespace-pre-wrap pl-4 text-ink text-sm">{comment.body}</p>
      </Stack>
    </div>
  )
}

/** The comments of one place, in the order they were said. */
export interface CommentGroup {
  key: string
  /** Which of the three places it is — a field of the research, a dataset, the whole. */
  kind: CommentAnchor["kind"]
  /** The indicator before the name — the place's kind, or a field's where a dataset is cut by field. */
  icon: IconName
  name: string
  comments: CommentView[]
}

/**
 * The icon a place has before its name: the same icon the link to that
 * place has elsewhere on the draft's screens, so that "ID 未発行" reads as
 * a dataset before its words are read.
 */
const ANCHOR_ICON: Record<CommentAnchor["kind"], IconName> = {
  "research-field": "type",
  "dataset-field": SUBJECT_ICON.dataset,
  "draft": "comment",
  "memo": SUBJECT_ICON.memo,
}

/**
 * What a comment is about, as one key. **A dataset is one place, not one per
 * field**: its fields are written on that dataset's own screen, so a reader of
 * this panel is told which dataset to open rather than which box inside it.
 */
function groupKey(anchor: CommentAnchor, perField: boolean): string {
  if (anchor.kind === "research-field") return `research:${anchor.path}`
  if (anchor.kind === "dataset-field") return perField ? `dataset:${anchor.datasetId}:${anchor.path}` : `dataset:${anchor.datasetId}`
  return anchor.kind
}

/**
 * The open comments gathered under their places, the places in the order they
 * were first spoken about. **Nothing is sorted** — what a reader has just been
 * told about stays where they saw it.
 */
export function groupedByAnchor(
  comments: readonly CommentView[],
  nameOf: (anchor: CommentAnchor) => string,
  /**
   * Cut a dataset by its fields. **On the dataset's own screen** the dataset is
   * the whole of what is being written, so the place a reader wants named is
   * the field; everywhere else it is which dataset to open.
   */
  perField = false,
): CommentGroup[] {
  const groups = new Map<string, CommentGroup>()
  for (const one of comments) {
    const key = groupKey(one.anchor, perField)
    const icon = perField && one.anchor.kind === "dataset-field" ? "type" : ANCHOR_ICON[one.anchor.kind]
    const held = groups.get(key) ?? { key, kind: one.anchor.kind, icon, name: nameOf(one.anchor), comments: [] }
    held.comments.push(one)
    groups.set(key, held)
  }
  return [...groups.values()]
}

/**
 * Writing something. The name box is there for a reader who has not signed in;
 * for one who has, the account's name is what the server signs with and the box
 * would be a second answer to the same question.
 *
 * **The box is shown on the page's tint, apart from the rows above it.** Rows and
 * the box are the same width in the same panel, and with nothing between them
 * the place to write reads as one more row.
 *
 * **The box empties once what was in it has been taken.** Only a posting
 * empties it: the same fetcher handles resolving and deleting, and an answer
 * to those must not throw away what is being typed. A refused posting keeps
 * the words, so they can be fixed rather than typed again. **Only a posting
 * shows 投稿中 and shuts the send button** (`postingInFlight`) — a row being
 * resolved is that row's business, and it shuts its own buttons.
 */
export function CommentForm({ context, at, fetcher, placeholder }: {
  context: CommentContext
  at?: string
  fetcher: Fetcher
  placeholder: string
}) {
  const t = messagesFor(context.locale).comment
  const remembered = useRememberedName()
  const busy = postingInFlight(fetcher)
  const subject = context.subject
  const form = useRef<HTMLFormElement>(null)
  const sent = useRef(false)
  const post = context.canResolve ? messagesFor(context.locale).admin.comment.post : t.post

  useEffect(() => {
    if (fetcher.state !== "idle" || !sent.current) return
    sent.current = false
    if (fetcher.data?.status !== "invalid") form.current?.reset()
  }, [fetcher.state, fetcher.data])

  return (
    <fetcher.Form
      ref={form}
      method="post"
      action={context.action}
      className="rounded bg-surface p-3"
      onSubmit={(event) => {
        sent.current = true
        const typed = new FormData(event.currentTarget).get("name")
        if (typeof typed === "string" && typed.trim() !== "") rememberName(typed.trim())
      }}
    >
      <Stack gap="tight">
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
        {/* **The way to send is shown at the box's right, on its middle line**: the
            box is two lines and the control one, and a control hanging under a
            box is a second row the reader has to find. */}
        <div className="flex items-center gap-2">
          <textarea
            name="body"
            rows={2}
            placeholder={placeholder}
            aria-label={t.body}
            className={`${CONTROL} min-w-0 flex-1 text-sm`}
          />
          {/* **The button keeps its name while it works.** What it is doing is
              said beside it, where assistive tech hears it as news rather than as
              the control changing identity. */}
          <Button type="submit" icon={<Icon name="send" aria-hidden="true" />} disabled={busy}>{post}</Button>
          <span role="status" className="self-center text-ink-muted text-xs">{busy ? t.posting : ""}</span>
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
 * **The entry is a `Button`; what it opens is a panel** — the same panel a
 * field's own indicator opens, so reading, writing and resolving are learned once.
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
        size="xs"
        // **Not the speech bubble**: a memo is a note kept, not a question
        // asked, and the indicator shows which of the two the entry opens.
        icon={<Icon name="clipboard" aria-hidden="true" />}
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
          placeholder={t.memoPlaceholder}
          empty={t.memoEmpty}
        />
      </Dialog>
    </>
  )
}

/** What the whole's entry and panel say, where the reader is not a curator. */
export interface WholeWords {
  entry: string
  wholeHint: string
  empty: string
  placeholder: string
}

/**
 * What has been said about the draft as a whole. The editing screen and the
 * share link open the same panel onto the same timeline, so a provider's remark
 * about the research and the office's answer are shown in one place for both.
 *
 * **The entry is a `Button`; what it opens is a panel**, the same one
 * `DraftNote`'s does. **Only the words and the size differ**: the share
 * link is addressed to a provider, and its entry
 * is shown with the two indicators at full size rather than in a toolbar.
 */
export function WholeNote({ context, comments, words, size = "xs" }: {
  context: CommentContext
  comments: readonly CommentView[]
  words?: WholeWords
  size?: ButtonSize
}) {
  const editor = messagesFor(context.locale).admin.editor
  const t: WholeWords = words ?? {
    entry: editor.whole,
    wholeHint: editor.wholeHint,
    empty: editor.wholeEmpty,
    placeholder: messagesFor(context.locale).comment.bodyPlaceholder,
  }
  const fetcher = useFetcher<Answer>()
  const shown = shownOf(fetcher.data, comments, (one) => one.anchor.kind === "draft")
  const open = unresolvedCount(shown)
  const [held, setHeld] = useState(false)

  return (
    <>
      <Button
        type="button"
        size={size}
        icon={<Icon name="comment" aria-hidden="true" />}
        onClick={() => { setHeld(true) }}
      >
        {t.entry}
        {shown.length > 0 && <Badge tone={open > 0 ? "accent" : undefined}>{shown.length}</Badge>}
      </Button>
      <Dialog
        title={t.entry}
        note={t.wholeHint}
        held={{ open: held, close: () => { setHeld(false) } }}
        dismiss={messagesFor(context.locale).comment.close}
      >
        <CommentTimeline
          context={{ ...context, subject: "draft" }}
          comments={shown}
          fetcher={fetcher}
          placeholder={t.placeholder}
          empty={t.empty}
        />
      </Dialog>
    </>
  )
}

/**
 * Every question still open on the draft, wherever it was asked — a field of
 * the research, a field of one of its datasets, or the draft as a whole — in
 * one panel, each under the link to the place it is about.
 *
 * **The entry is shown with the memo and the whole**, the three panels a curator
 * reads while typing. **The rows are the rows the places' own panels draw**
 * (`CommentRow`), so resolving here is the same press as resolving there.
 * **Nothing is written here** — an answer belongs at the place it responds to,
 * and the way there is shown over each row.
 * A memo line is never open: it is a note, not a question.
 */
export function OpenComments({ context, comments, nameOf, perField = false }: {
  context: CommentContext
  comments: readonly CommentView[]
  /** What to call the place a comment is about, in the screen's own words. */
  nameOf: (anchor: CommentAnchor) => string
  /** Cut a dataset by its fields (`groupedByAnchor`). */
  perField?: boolean
}) {
  const t = messagesFor(context.locale).admin.editor
  const fetcher = useFetcher<Answer>()
  const isOpen = (one: CommentView): boolean => one.anchor.kind !== "memo" && !one.resolved
  const shown = shownOf(fetcher.data, comments.filter(isOpen), isOpen)
  const [held, setHeld] = useState(false)
  const close = () => {
    setHeld(false)
  }
  const groups = groupedByAnchor(shown, nameOf, perField)

  return (
    <>
      <Button
        type="button"
        size="xs"
        icon={<Icon name="comment" aria-hidden="true" />}
        onClick={() => { setHeld(true) }}
      >
        {t.openComments}
        {shown.length > 0 && <Badge tone="accent">{shown.length}</Badge>}
      </Button>
      <Dialog
        title={t.openComments}
        held={{ open: held, close }}
        dismiss={messagesFor(context.locale).comment.close}
      >
        <AnchorGroups context={context} groups={groups} fetcher={fetcher} />
      </Dialog>
    </>
  )
}

/**
 * The open comments, one box per place — the same list in the panel and on the
 * review screen, so the two say "nothing open" the same way too.
 */
export function AnchorGroups({ context, groups, fetcher }: {
  context: CommentContext
  groups: readonly CommentGroup[]
  fetcher?: Fetcher
}) {
  if (groups.length === 0) return <Empty>{messagesFor(context.locale).admin.editor.openCommentsEmpty}</Empty>
  return (
    <Stack as="ul" gap="normal">
      {groups.map((group) => (
        <li key={group.key}>
          <AnchorGroup context={context} group={group} fetcher={fetcher} />
        </li>
      ))}
    </Stack>
  )
}

/**
 * One place and the open comments said about it.
 *
 * **The place is a box, and its name is the header on top of it.** A name set in
 * small muted letters over a rule is weaker than the rows under it — each row
 * begins with a person, a time and a badge — and nothing shows where one place
 * ends and the next begins. The border closes the place; the header, on the
 * page's tint, is read before the rows are. The name is the body's size and
 * colour, with the place's icon before it and the count after it.
 */
export function AnchorGroup({ context, group, fetcher }: {
  context: CommentContext
  group: CommentGroup
  fetcher?: Fetcher
}) {
  return (
    <section className="rounded border border-line">
      <h3 className="flex items-center gap-2 rounded-t bg-surface px-4 py-2 font-semibold text-ink text-sm">
        <Icon name={group.icon} aria-hidden="true" />
        {group.name}
        <Badge>{group.comments.length}</Badge>
      </h3>
      {/* The header's lower edge is where the first row's rule would be, so the
          first row does not draw its own. */}
      <div className="px-4 pb-3 [&>*:first-child>*:first-child]:border-t-0">
        <Stack gap="tight">
          {group.comments.map((one) => (
            <CommentRow key={one.id} context={context} comment={one} fetcher={fetcher} />
          ))}
        </Stack>
      </div>
    </section>
  )
}
