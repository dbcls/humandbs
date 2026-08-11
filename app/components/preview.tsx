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

import { CommentSpot, rememberName, useRememberedName, type CommentContext } from "./comments"
import { DatasetBody } from "./dataset"
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
      />
      <Card>
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
            datasetHref={(ref) => ref.id === null
              ? null
              : href(locale, previewDatasetPath(view.token, ref.id))}
          />
        </AnnotationLayer>
        <Acknowledge shell={view} problem={problem} />
      </Card>
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
      />
      <Card>
        <p className="mb-4 text-sm">
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
      </Card>
    </Page>
  )
}

/** Both marks of one place: what changed, and what has been said about it. */
function Marks({ context, at, view, threads, heading }: {
  context: CommentContext
  at: string
  view: { changed: string[], previous: PreviewResearchPageView["previous"] }
  threads: PreviewResearchPageView["threads"]
  heading: string
}) {
  return (
    <span className="inline-flex flex-wrap items-start gap-1 align-top">
      {view.changed.includes(at) && (
        <PreviousMark locale={context.locale} value={view.previous[at]} heading={heading} />
      )}
      <CommentSpot context={context} at={at} threads={threads} />
    </span>
  )
}

function PreviewHead({ shell, label, threads, locale }: {
  shell: PreviewShell & { changed: string[] }
  label: string
  threads: Record<string, PreviewShell["threads"]>
  locale: Locale
}) {
  const t = messagesFor(locale).preview
  const open = Object.entries(threads)
  const unresolved = unresolvedCount(shell.threads)

  return (
    <>
      <PageHead label={label}>
        <span className="rounded-sm bg-white/20 px-2 py-0.5">{t.heading}</span>
      </PageHead>
      <div className="border-accent border-x border-t bg-surface px-5 py-4 text-sm">
        <p className="font-semibold">{t.notPublished}</p>
        <p className="mt-1 text-ink-muted">{t.unsettledNotice}</p>
        <p className="mt-2">
          {shell.publishedNumber === null
            ? t.noPublished
            : shell.changed.length === 0
              ? t.differsNone
              : t.differs(shell.changed.length)}
        </p>
        {open.length === 0 && <p className="mt-2 text-ink-muted text-xs">{t.noComments}</p>}
        {open.length > 0 && (
          <div className="mt-2">
            <p className="text-ink-muted text-xs">
              {`${t.commentPlaces} — ${t.commentCount(unresolved)}`}
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {open.map(([path, held]) => (
                <li key={path} className="rounded-sm border border-line bg-white px-2 py-0.5 text-xs">
                  <a href={`#${encodeURIComponent(path)}`}>
                    {`${path} (${held.length})`}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <WhoBar shell={shell} locale={locale} />
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
      <p className="mt-3 text-ink-muted text-xs">
        {`${t.who}: ${shell.signedInName}`}
      </p>
    )
  }

  return (
    <div className="mt-3 text-xs">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-ink-muted">{t.who}</span>
        <input
          type="text"
          key={remembered}
          defaultValue={remembered}
          placeholder={t.whoPlaceholder}
          className="rounded-sm border border-line px-2 py-1"
          onBlur={(event) => { rememberName(event.currentTarget.value.trim()) }}
        />
      </label>
      <p className="mt-1 text-ink-muted">{t.whoHint}</p>
    </div>
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
    <section className="mt-10 border-line border-t pt-6 text-sm">
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
            className="rounded-sm border border-line px-2 py-1"
          />
        )}
        <button
          type="submit"
          className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand"
        >
          {t.lgtm}
        </button>
        {/* Only a signed-in reader can be recognised in the list; a
            self-declared name is whoever typed it this time. */}
        {shell.signedInName !== null
          && shell.acknowledgements.some((row) => row.name === shell.signedInName)
          ? <span className="text-brand text-xs">{t.lgtmDone}</span>
          : <span className="text-ink-muted text-xs">{t.lgtmHint}</span>}
      </Form>

      {problem !== null && (
        <p className="mt-1 text-danger text-xs">
          {messagesFor(shell.locale).comment[
            problem === "name-required"
              ? "nameRequired"
              : problem === "body-required" ? "bodyRequired" : "tooLong"
          ]}
        </p>
      )}

      {shell.acknowledgements.length > 0 && (
        <div className="mt-3">
          <p className="text-ink-muted text-xs">{t.lgtmWho}</p>
          <ul className="mt-1 flex flex-wrap gap-2 text-xs">
            {shell.acknowledgements.map((row) => (
              <li key={`${row.name}-${row.createdAt}`} className="rounded-sm border border-line px-2 py-0.5">
                {row.name}
                {row.bySignedIn && <span aria-hidden="true"> 🅳</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
