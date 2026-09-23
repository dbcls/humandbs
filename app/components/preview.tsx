/**
 * What a share link opens.
 *
 * The page inside the banner is the published page: same projection, same view,
 * same components. What the banner adds is everything a reader of a draft needs
 * and a reader of a published page does not — that this is not published yet,
 * that the marked places are where it differs from what is out there now, and
 * where the questions are.
 *
 * Marks come from the annotation layer, so nothing below the banner knows it is
 * being previewed.
 */

import type { ReactNode } from "react"
import { Form, Link } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import { commentsByPath, unresolvedCount, type CommentProblem, type CommentView } from "~/review/comments"
import type {
  PreviewDatasetPageView,
  PreviewResearchPageView,
  PreviewShell,
} from "~/review/preview.server"
import { previewDatasetPath, previewPath } from "~/review/urls"

import { Badge, Button, Stack } from "./base"
import { CommentSpot, CommentTimeline, DdbjMark, rememberName, useRememberedName, type CommentContext } from "./comments"
import { DatasetBody } from "./dataset"
import { CONTROL } from "./form"
import { AnnotationLayer, Card, Empty, Page, PageHead } from "./page"
import { PreviousMark } from "./previous"
import { ResearchBody } from "./research"

export function PreviewResearchScreen({ view, problem }: {
  view: PreviewResearchPageView
  /** What a form posted from the page itself was refused for. */
  problem: CommentProblem | null
}) {
  const locale = view.locale
  const context: CommentContext = {
    locale,
    action: href(locale, previewPath(view.token)),
    subject: RESEARCH,
    canResolve: false,
    signedInName: view.signedInName,
  }
  const byPath = commentsByPath(view.comments, RESEARCH)

  return (
    <Page>
      <PreviewHead
        shell={view}
        label={view.humLabel ?? title(view)}
        comments={byPath}
        locale={locale}
        problem={problem}
        whole={{ ...context, subject: "draft" }}
      >
        <Stack gap="block">
          <AnnotationLayer annotate={(at) => (
            <Marks
              context={context}
              at={at}
              view={view}
              comments={byPath[at] ?? []}
              heading={view.publishedNumber === null
                ? ""
                : messagesFor(locale).preview.previousIn(view.publishedNumber)}
            />
          )}
          >
            <ResearchBody
              view={view.view}
              locale={locale}
              releaseNote
              datasetHref={(ref) => ref.id === null
                ? null
                : href(locale, previewDatasetPath(view.token, ref.id))}
            />
          </AnnotationLayer>
        </Stack>
      </PreviewHead>
    </Page>
  )
}

function title(view: PreviewResearchPageView): string {
  const field = view.view.title
  return field.state === "plain" && field.text !== ""
    ? field.text
    : messagesFor(view.locale).preview.heading
}

export function PreviewDatasetScreen({ view, problem }: {
  view: PreviewDatasetPageView
  problem: CommentProblem | null
}) {
  const locale = view.locale
  const subject = { kind: "dataset" as const, datasetId: view.datasetId }
  const context: CommentContext = {
    locale,
    action: href(locale, previewDatasetPath(view.token, view.datasetId)),
    subject,
    canResolve: false,
    signedInName: view.signedInName,
  }
  const byPath = commentsByPath(view.comments, subject)
  const t = messagesFor(locale).preview

  return (
    <Page>
      <PreviewHead
        shell={view}
        label={view.datasetLabel ?? t.unnamedDataset}
        comments={byPath}
        locale={locale}
        problem={problem}
      >
        <Stack gap="block">
          <p className="text-sm">
            <Link to={href(locale, previewPath(view.token))}>{t.backToResearch}</Link>
          </p>
          <AnnotationLayer annotate={(at) => (
            <Marks
              context={context}
              at={at}
              view={view}
              comments={byPath[at] ?? []}
              heading={t.previousPublished}
            />
          )}
          >
            <DatasetBody
              view={view.view}
              locale={locale}
              researchHref={href(locale, previewPath(view.token))}
              accessAnchor={view.accessAnchor}
              typeOfDataAnchor={view.typeOfDataAnchor}
            />
          </AnnotationLayer>
        </Stack>
      </PreviewHead>
    </Page>
  )
}

/**
 * Both marks of one place: what changed, and what has been said about it.
 *
 * **They sit on the first line of the value and do not make it taller.** A mark
 * is `size-tap` (36px) against a line of 22.4px, so a pair left to its own
 * height opened the line to fit it — which pushed every row of every table down
 * and left the marks reading seven pixels below the words they belong to. The
 * negative margin takes the difference back out of the line while the thing a
 * finger has to find keeps its size.
 */
export function Marks({ context, at, view, comments, heading, fieldLabel }: {
  context: CommentContext
  at: string
  view: { changed: string[], previous: PreviewResearchPageView["previous"] }
  comments: readonly CommentView[]
  heading: string
  /** The field's own name, for the comment panel's heading (`comments.tsx` の `CommentSpot`). */
  fieldLabel?: string
}) {
  return (
    <span className="-my-2 ml-2 inline-flex flex-wrap items-start gap-1 align-top">
      {view.changed.includes(at) && (
        <PreviousMark locale={context.locale} value={view.previous[at]} heading={heading} />
      )}
      <CommentSpot context={context} at={at} comments={comments} fieldLabel={fieldLabel} />
    </span>
  )
}

/**
 * The banner over a preview: that this is not published, what to do here, the
 * two marks a reader can leave, what has been said about the whole, and where
 * the marked places are.
 *
 * **The steps come first and are written out**, numbered, rather than drawn as
 * a chart: a provider opening the link for the first time has to know what is
 * asked of them before reading, and a list is read in the same order by a
 * screen reader. **The two marks stand under the steps that name them.** The
 * research page carries all of this; a dataset page, which is one step down
 * from it, carries only its own places and the way back.
 */
function PreviewHead({ shell, label, comments, locale, problem, whole, children }: {
  shell: PreviewShell & { changed: string[] }
  label: string
  comments: Record<string, CommentView[]>
  locale: Locale
  /** What a form posted from the page itself was refused for. */
  problem: CommentProblem | null
  /** Where a comment on the whole posts, on the page that has one. */
  whole?: CommentContext
  /** The page being previewed, which the same outline has to close around. */
  children: ReactNode
}) {
  const t = messagesFor(locale).preview
  const open = Object.entries(comments)
  const unresolved = unresolvedCount(shell.comments)

  return (
    <>
      <PageHead label={label}>
        <Badge onBand>{t.heading}</Badge>
      </PageHead>
      {/*
        **The outline goes round the whole of what is not published**, banner
        and page together. Drawn round the banner alone it stopped mid-page in
        three sides of a box, which reads as something half-finished rather than
        as a boundary.
      */}
      <div className="rounded-b border-accent border-x border-b">
        <div className="border-line border-b bg-surface px-6 py-4 text-sm">
          <Stack gap="normal">
            <p className="font-semibold">{t.notPublished}</p>
            {whole !== undefined && (
              <Stack gap="tight">
                <p className="font-semibold">{t.stepsHeading}</p>
                <ol className="list-decimal space-y-1 pl-6">
                  {t.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </Stack>
            )}
            {whole !== undefined && <Decide shell={shell} problem={problem} />}
            {whole !== undefined && (
              <Stack gap="tight">
                <p className="font-semibold">{t.whole}</p>
                <CommentTimeline
                  context={whole}
                  comments={shell.comments.filter((one) => one.anchor.kind === "draft")}
                  placeholder={t.wholePlaceholder}
                  empty={t.wholeEmpty}
                />
              </Stack>
            )}
            {whole === undefined && problem !== null && (
              <p className="text-danger text-xs">{problemText(locale, problem)}</p>
            )}
            <p>
              {shell.publishedNumber === null
                ? t.noPublished
                : shell.changed.length === 0
                  ? t.differsNone
                  : t.differs(shell.changed.length)}
            </p>
            {open.length === 0 && <Empty>{t.noComments}</Empty>}
            {open.length > 0 && (
              <Stack gap="tight">
                <p className="text-ink-muted text-xs">
                  {`${t.commentPlaces} — ${t.commentCount(unresolved)}`}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {open.map(([path, held]) => (
                    <li key={path}>
                      <a href={`#${encodeURIComponent(path)}`} className="flex no-underline">
                        <Badge tone="brand">{`${path} (${held.length})`}</Badge>
                      </a>
                    </li>
                  ))}
                </ul>
              </Stack>
            )}
            <WhoBar shell={shell} locale={locale} />
          </Stack>
        </div>
        <Card>{children}</Card>
      </div>
    </>
  )
}

/**
 * Who the reader is signing as. A DDBJ account settles it; otherwise the name
 * typed here is what the comment forms start with, kept for this session only.
 */
function WhoBar({ shell, locale }: { shell: PreviewShell, locale: Locale }) {
  const t = messagesFor(locale).preview
  const remembered = useRememberedName()

  if (shell.signedInName !== null) {
    return (
      <p className="text-ink-muted text-xs">
        {`${t.who}: ${shell.signedInName}`}
      </p>
    )
  }

  return (
    <Stack gap="tight">
      <label className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-muted">{t.who}</span>
        <input
          type="text"
          key={remembered}
          defaultValue={remembered}
          placeholder={t.whoPlaceholder}
          className={CONTROL}
          onBlur={(event) => { rememberName(event.currentTarget.value.trim()) }}
        />
      </label>
      <p className="text-ink-muted text-xs">{t.whoHint}</p>
    </Stack>
  )
}

function problemText(locale: Locale, problem: CommentProblem): string {
  const t = messagesFor(locale).comment
  if (problem === "name-required") return t.nameRequired
  return problem === "body-required" ? t.bodyRequired : t.tooLong
}

/**
 * The two marks a reader can leave: that they have finished commenting and it
 * is the office's turn, or that there is nothing to fix. Neither is an
 * approval, and neither says anything back once pressed — the name joins the
 * list under the button, which is the record.
 *
 * **Each button says the whole sentence.** A reader who opens the link once
 * has no other way to learn what pressing it means, so the words are long
 * rather than short, and an abbreviation would say nothing to them.
 */
function Decide({ shell, problem }: {
  shell: PreviewShell
  problem: CommentProblem | null
}) {
  const t = messagesFor(shell.locale).preview
  const remembered = useRememberedName()

  return (
    <Stack gap="tight">
      {(["commented", "approved"] as const).map((kind) => {
        const rows = shell.acknowledgements.filter((row) => row.kind === kind)
        return (
          <Stack key={kind} gap="tight">
            <Form method="post" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="intent" value="acknowledge" />
              <input type="hidden" name="kind" value={kind} />
              {shell.signedInName === null && (
                <input
                  type="text"
                  name="name"
                  key={remembered}
                  defaultValue={remembered}
                  aria-label={t.who}
                  placeholder={t.whoPlaceholder}
                  className={CONTROL}
                />
              )}
              <Button type="submit" variant={kind === "approved" ? "primary" : "secondary"}>
                {kind === "commented" ? t.commented : t.approved}
              </Button>
            </Form>
            {rows.length > 0 && (
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-muted">{kind === "commented" ? t.commentedBy : t.approvedBy}</span>
                {rows.map((row) => (
                  <Badge key={`${row.name}-${row.createdAt}`}>
                    {row.name}
                    {row.bySignedIn && <DdbjMark locale={shell.locale} />}
                  </Badge>
                ))}
              </p>
            )}
          </Stack>
        )
      })}
      {problem !== null && (
        <p className="text-danger text-xs">{problemText(shell.locale, problem)}</p>
      )}
    </Stack>
  )
}
