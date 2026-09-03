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
import { threadsByPath, unresolvedCount, type CommentProblem } from "~/review/comments"
import type {
  PreviewDatasetPageView,
  PreviewResearchPageView,
  PreviewShell,
} from "~/review/preview.server"
import { previewDatasetPath, previewPath } from "~/review/urls"

import { Badge, Button, Stack } from "./base"
import { CommentSpot, DdbjMark, rememberName, useRememberedName, type CommentContext } from "./comments"
import { DatasetBody } from "./dataset"
import { CONTROL } from "./form"
import { AnnotationLayer, Card, Page, PageHead } from "./page"
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
  const byPath = threadsByPath(view.threads, RESEARCH)

  return (
    <Page>
      <PreviewHead
        shell={view}
        label={view.humLabel ?? title(view)}
        threads={byPath}
        locale={locale}
      >
        <Stack gap="block">
          <AnnotationLayer annotate={(at) => (
            <Marks
              context={context}
              at={at}
              view={view}
              threads={byPath[at] ?? []}
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
          <Acknowledge shell={view} problem={problem} />
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
  const byPath = threadsByPath(view.threads, subject)
  const t = messagesFor(locale).preview

  return (
    <Page>
      <PreviewHead
        shell={view}
        label={view.datasetLabel ?? t.unnamedDataset}
        threads={byPath}
        locale={locale}
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
              threads={byPath[at] ?? []}
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
          <Acknowledge shell={view} problem={problem} />
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
function Marks({ context, at, view, threads, heading }: {
  context: CommentContext
  at: string
  view: { changed: string[], previous: PreviewResearchPageView["previous"] }
  threads: PreviewResearchPageView["threads"]
  heading: string
}) {
  return (
    <span className="-my-2 ml-2 inline-flex flex-wrap items-start gap-1 align-top">
      {view.changed.includes(at) && (
        <PreviousMark locale={context.locale} value={view.previous[at]} heading={heading} />
      )}
      <CommentSpot context={context} at={at} threads={threads} />
    </span>
  )
}

function PreviewHead({ shell, label, threads, locale, children }: {
  shell: PreviewShell & { changed: string[] }
  label: string
  threads: Record<string, PreviewShell["threads"]>
  locale: Locale
  /** The page being previewed, which the same outline has to close around. */
  children: ReactNode
}) {
  const t = messagesFor(locale).preview
  const open = Object.entries(threads)
  const unresolved = unresolvedCount(shell.threads)

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
          <Stack gap="tight">
            <p className="font-semibold">{t.notPublished}</p>
            <p className="text-ink-muted">{t.unsettledNotice}</p>
            <p>
              {shell.publishedNumber === null
                ? t.noPublished
                : shell.changed.length === 0
                  ? t.differsNone
                  : t.differs(shell.changed.length)}
            </p>
            {open.length === 0 && <p className="text-ink-muted text-xs">{t.noComments}</p>}
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

/** "I have looked at this." Not an approval, and not a step in publishing. */
function Acknowledge({ shell, problem }: {
  shell: PreviewShell
  problem: CommentProblem | null
}) {
  const t = messagesFor(shell.locale).preview
  const remembered = useRememberedName()

  return (
    <section className="border-line border-t pt-6 text-sm">
      <Stack gap="tight">
        <Form method="post" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="intent" value="acknowledge" />
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
          <Button type="submit">{t.lgtm}</Button>
          {/* Only a signed-in reader can be recognised in the list; a
              self-declared name is whoever typed it this time. */}
          {shell.signedInName !== null
            && shell.acknowledgements.some((row) => row.name === shell.signedInName)
            ? <span className="text-brand text-xs">{t.lgtmDone}</span>
            : <span className="text-ink-muted text-xs">{t.lgtmHint}</span>}
        </Form>

        {problem !== null && (
          <p className="text-danger text-xs">
            {messagesFor(shell.locale).comment[
              problem === "name-required"
                ? "nameRequired"
                : problem === "body-required" ? "bodyRequired" : "tooLong"
            ]}
          </p>
        )}

        {shell.acknowledgements.length > 0 && (
          <Stack gap="tight">
            <p className="text-ink-muted text-xs">{t.lgtmWho}</p>
            <ul className="flex flex-wrap gap-2">
              {shell.acknowledgements.map((row) => (
                <li key={`${row.name}-${row.createdAt}`}>
                  <Badge>
                    {row.name}
                    {row.bySignedIn && <DdbjMark locale={shell.locale} />}
                  </Badge>
                </li>
              ))}
            </ul>
          </Stack>
        )}
      </Stack>
    </section>
  )
}
