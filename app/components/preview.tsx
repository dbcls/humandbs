/**
 * What a share link opens.
 *
 * The page inside the banner is the published page: same projection, same view,
 * same components. What the banner adds is everything a reader of a draft needs
 * and a reader of a published page does not — that this is not published yet,
 * that the marked places are where it differs from what is out there now, and
 * where the questions are.
 *
 * Annotations come from the annotation layer, so nothing below the banner knows it is
 * being previewed.
 */

import type { ReactNode } from "react"
import { Form, Link, useLocation, useNavigation } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import { commentsByPath, type CommentProblem, type CommentView } from "~/review/comments"
import type {
  PreviewActionResult,
  PreviewDatasetPageView,
  PreviewResearchPageView,
  PreviewShell,
} from "~/review/preview.server"
import { previewDatasetPath, previewPath } from "~/review/urls"

import { Badge, Button, ButtonLink, Note, Stack } from "./base"
import { type CommentContext, CommentSpot, problemText, rememberName, useRememberedName, WholeNote } from "./comments"
import { DatasetBody } from "./dataset"
import { Answer, CONTROL } from "./form"
import { AnnotationLayer, Card, Code, Page, PageHeader } from "./page"
import { Icon } from "./icons"
import { PreviousIndicator } from "./previous"
import { ResearchBody } from "./research"
import { firstSentence } from "./review"

export function PreviewResearchScreen({ view, answer }: {
  view: PreviewResearchPageView
  /** What the response was to a form posted from the page itself. */
  answer: PreviewActionResult | undefined
}) {
  const locale = view.locale
  const problem = answer?.status === "invalid" ? answer.problem : null
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
      <PreviewActionNotice answer={answer} locale={locale} />
      <PreviewHead
        shell={view}
        label={view.humLabel ?? title(view)}
        locale={locale}
        problem={problem}
        whole={{ ...context, subject: "draft" }}
      >
        <Stack gap="block">
          <AnnotationLayer annotate={(at, name) => (
            <FieldAnnotations
              context={context}
              at={at}
              view={view}
              comments={byPath[at] ?? []}
              fieldLabel={name}
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
        locale={locale}
        problem={problem}
      >
        <Stack gap="block">
          <p className="text-sm">
            <Link to={href(locale, previewPath(view.token))}>{t.backToResearch}</Link>
          </p>
          <AnnotationLayer annotate={(at, name) => (
            <FieldAnnotations
              context={context}
              at={at}
              view={view}
              comments={byPath[at] ?? []}
              fieldLabel={name}
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
 * Both indicators of one place: what changed, and what has been said about it.
 *
 * **They sit on the first line of the value and do not make it taller.** Both
 * are drawn no higher than the 22.4px line the words set (`CommentSpot`,
 * `PreviousIndicator`), so a pair is shown inside it and pushes no row of any table down.
 * Both are shown with the name (`page.tsx` の `Annotate`), the comment first and
 * the change after it — the same order the form beside the page uses.
 */
export function FieldAnnotations({ context, at, view, comments, heading, fieldLabel }: {
  context: CommentContext
  at: string
  view: { changed: string[], previous: PreviewResearchPageView["previous"], current: PreviewResearchPageView["current"] }
  comments: readonly CommentView[]
  heading: string
  /** The field's own name, for the comment panel's heading (`comments.tsx` の `CommentSpot`). */
  fieldLabel?: string
}) {
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-top">
      <CommentSpot context={context} at={at} comments={comments} fieldLabel={fieldLabel} />
      {view.changed.includes(at) && (
        <PreviousIndicator
          locale={context.locale}
          value={view.previous[at]}
          current={view.current[at]}
          heading={heading}
          fieldLabel={fieldLabel}
        />
      )}
    </span>
  )
}

/**
 * A preview in two boxes: what the reader is asked to do here, and then the
 * page as it will be published.
 *
 * **The request is a card of its own, above the page.** Merged into the page's
 * box it was shown between the header bar and the first section, and the page no longer
 * read as the published page it is meant to be checked as. Below it the page
 * looks exactly like a published one — the header bar, then the white box.
 *
 * **The steps come first and are written out**, numbered, rather than drawn as
 * a chart: a provider opening the link for the first time has to know what is
 * asked of them before reading, and a list is read in the same order by a
 * screen reader. **The whole's entry and the two indicators are shown under the steps
 * that name them, in the steps' order.** What has been said about the whole is
 * read in its panel, as on the editing screen, rather than as a thread that
 * grows at the head of the page. **Who has pressed an indicator is not listed here**:
 * it is the office's record (the review screen), and a provider reading
 * another provider's name learns nothing about what to do. A dataset page,
 * one step down from the research, has only the notice and the name.
 */
export function PreviewHead({ shell, label, locale, problem, whole, children }: {
  shell: PreviewShell
  label: string
  locale: Locale
  /** What a form posted from the page itself was refused for. */
  problem: CommentProblem | null
  /** Where a comment on the whole posts, on the page that has one. */
  whole?: CommentContext
  /** The page being previewed. */
  children: ReactNode
}) {
  const t = messagesFor(locale).preview

  return (
    <Stack gap="normal">
      <Card under={false}>
        <Stack gap="normal">
          <Stack gap="tight">
            <p className="font-semibold">{t.notPublished}</p>
            <p className="text-sm">{t.notPublishedNote}</p>
          </Stack>
          {whole !== undefined && (
            <Stack gap="tight">
              <p className="font-semibold text-sm">{t.stepsHeading}</p>
              <ol className="list-decimal space-y-1 pl-6 text-sm">
                {stepsFor(shell).map((step, at) => <li key={at}>{step}</li>)}
              </ol>
            </Stack>
          )}
          <WhoBar shell={shell} locale={locale} joins={whole === undefined ? undefined : DECIDE_FORM} />
          {whole !== undefined && (
            <Decide shell={shell}>
              <WholeNote
                context={whole}
                comments={shell.comments.filter((one) => one.anchor.kind === "draft")}
                size="sm"
                words={{
                  entry: t.whole,
                  wholeHint: t.wholeHint,
                  empty: t.wholeEmpty,
                  placeholder: t.wholePlaceholder,
                }}
              />
            </Decide>
          )}
          {problem !== null && (
            <Note kind="danger" live>{problemText(locale, problem)}</Note>
          )}
        </Stack>
      </Card>
      <div>
        <PageHeader label={label}>
          <Badge onHeaderBar>{t.heading}</Badge>
        </PageHeader>
        <Card>{children}</Card>
      </div>
    </Stack>
  )
}

/**
 * What a reader is asked to do, in the order they do it.
 *
 * **Saying who they are comes first**: a comment is refused without a name,
 * and a reader who learns that only on posting has to type the comment twice.
 * Signed in, the step shows which name the comments will be posted under instead of
 * asking for one. **The "変更あり" badge is explained only where it can
 * appear** — on a draft that updates a published version; elsewhere the
 * sentence describes nothing on the page. **The datasets are a step of their
 * own**: each has a page of its own, reached from the research's table, and a
 * reader who stops at the research page never sees those items. **The two
 * buttons are two steps, in the order the exchange goes** — commenting, the
 * office's corrections, then the final confirmation on the corrected content;
 * the second is also the only one to press when there is nothing to show.
 * **Each is named by the button's own word**, built from it, so the step and
 * the button cannot show different things.
 */
export function stepsFor(shell: PreviewShell): ReactNode[] {
  const t = messagesFor(shell.locale).preview
  return [
    shell.signedInName === null
      ? t.steps.who
      : (
          <>
            {t.steps.signedIn.before}
            <AccountName name={shell.signedInName} />
            {t.steps.signedIn.after}
          </>
        ),
    shell.publishedNumber === null ? t.steps.read : `${t.steps.read}${shell.locale === "ja" ? "" : " "}${t.steps.changed}`,
    t.steps.unsettled,
    t.steps.other,
    t.steps.datasets,
    t.steps.commented(t.commented),
    t.steps.approved(t.approved),
  ]
}

/**
 * The name of the account a reader is signed in with, set as code — an
 * identifier the account holder chose, which a sentence around it should not
 * be read into — on the tint inline code has in the site's articles.
 */
function AccountName({ name }: { name: string }) {
  return <Code className="rounded bg-surface px-1">{name}</Code>
}

/**
 * Who the reader is signing as. A DDBJ account settles it; otherwise the name
 * typed here is what the comment forms start with, kept for this session only.
 */
function WhoBar({ shell, locale, joins }: {
  shell: PreviewShell
  locale: Locale
  /** The form the typed name is also sent with (`Decide`), on the page that has one. */
  joins?: string
}) {
  const t = messagesFor(locale).preview
  const remembered = useRememberedName()
  const location = useLocation()

  if (shell.signedInName !== null) {
    return (
      // The size of the words it is shown beside: the step above shows this name
      // and the reader looks for it here.
      <p className="text-sm">
        <span className="text-ink-muted">{`${t.who}: `}</span>
        <AccountName name={shell.signedInName} />
      </p>
    )
  }

  // The return address is this page, so a reader who signs in lands where they were.
  const back = new URLSearchParams({ redirect: `${location.pathname}${location.search}` })

  return (
    <Stack gap="tight">
      {/* **The two ways of indicating who is writing are shown on one line**, joined by
          "または": typing a name and signing in answer the same question, and
          the step above names both. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-ink-muted">{t.who}</span>
          <input
            type="text"
            name={joins === undefined ? undefined : "name"}
            form={joins}
            key={remembered}
            defaultValue={remembered}
            placeholder={t.whoPlaceholder}
            className={CONTROL}
            onBlur={(event) => { rememberName(event.currentTarget.value.trim()) }}
          />
        </label>
        <span className="text-ink-muted">{t.whoOr}</span>
        <ButtonLink to={`/auth/login?${back.toString()}`} external size="xs" icon={<Icon name="log-in" aria-hidden="true" />}>
          {t.logIn}
        </ButtonLink>
      </div>
      <p className="text-ink-muted text-xs">{t.whoHint}</p>
    </Stack>
  )
}

/**
 * The two indicators a reader can leave: that they have finished commenting and it
 * is the office's turn, or that there is nothing to fix. Neither is an
 * approval, and neither shows anything back once pressed — the office reads who
 * pressed which on its own screen.
 *
 * **Each button shows the whole sentence.** A reader who opens the link once
 * has no other way to learn what pressing it means, so the words are long
 * rather than short, and an abbreviation would show nothing to them.
 */
function Decide({ shell, children }: {
  shell: PreviewShell
  /** What is shown before the two, in the order the steps name them. */
  children: ReactNode
}) {
  const t = messagesFor(shell.locale).preview
  // **While an indicator is on its way, neither can be pressed again.** Both keep
  // their words and widths, so nothing beside them moves at the moment the
  // reader is watching; the word for the wait is read out beside them.
  const navigation = useNavigation()
  const sending = navigation.state === "submitting" && navigation.formData?.get("intent") === "acknowledge"
    ? navigation.formData.get("kind")
    : null

  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
      {/* **One form, and the button pressed shows which indicator.** The name is the
          one typed under "お名前" (`WhoBar`), which joins this form by its id
          rather than being asked for a second time beside each button. */}
      <Form id={DECIDE_FORM} method="post" className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="intent" value="acknowledge" />
        <Button type="submit" name="kind" value="commented" variant="secondary" icon={<Icon name="send" aria-hidden="true" />} disabled={sending !== null} aria-busy={sending === "commented" || undefined}>
          {t.commented}
        </Button>
        <Button type="submit" name="kind" value="approved" variant="primary" icon={<Icon name="check" aria-hidden="true" />} disabled={sending !== null} aria-busy={sending === "approved" || undefined}>
          {t.approved}
        </Button>
        {sending !== null && <span role="status" className="sr-only">{t.sending}</span>}
      </Form>
    </div>
  )
}

/**
 * What pressing an indicator reports: that it reached the office, naming the indicator by
 * its first sentence as the office's own screen does.
 *
 * **Over the page, and only for a moment** (`Answered`): the page is what the
 * reader came to check, and a sentence left in its head would push the page
 * down by the height of a thing already done. A refusal is not answered here —
 * it is the name that was missing, and it is said under the name.
 */
export function PreviewActionNotice({ answer, locale }: { answer: PreviewActionResult | undefined, locale: Locale }) {
  const messages = messagesFor(locale)
  const t = messages.preview
  return (
    <Answer
      answer={answer}
      locale={locale}
      label={t.notice}
      dismiss={messages.comment.close}
      said={(one) => one.status === "acknowledged"
        ? t.sent(firstSentence(one.kind === "commented" ? t.commented : t.approved))
        : null}
      ok={() => true}
    />
  )
}

/** The id the two indicators' form is known by, so the name field can join it from outside. */
const DECIDE_FORM = "preview-decide"
