/**
 * The screen a research draft is written on.
 *
 * The research is one document and is posted as one, because a version of a
 * research is one thing: half of it saved is not a state anybody asked for. Its
 * datasets are not part of that document — they are their own identities with
 * their own revisions — so they are written on their own screen, reached from
 * here.
 *
 * **What is typed is never taken away.** Marking a field unsettled keeps the
 * half-written text beside it, refused markup comes back attached to the field
 * it was written in, and a save rejected because somebody else got there first
 * leaves the form exactly as it was and offers their version one field at a
 * time.
 *
 * **The form is one column, in the order the public page runs in.** It is read
 * beside that page, and a reader following the two together cannot do it if one
 * of them is cut into panels. Nothing is hidden, so a mark beside a field is
 * always where the field is.
 */

import { useState, type ReactNode } from "react"
import { Link } from "react-router"

import { diffDraftInput, takeField } from "~/admin/diff"
import type {
  DataProviderInput,
  DraftInput,
  LinkInput,
  LinksPairInput,
  ResearchContentInput,
} from "~/admin/form"
import type { AdminDraftPageView } from "~/admin/pages.server"
import type { ResearchDatasetRow } from "~/admin/queries.server"
import type { DraftStepsView } from "~/admin/steps.server"
import {
  adminDraftDatasetsPath,
  adminDraftPublishPath,
  adminDraftReviewPath,
  adminDraftUpstreamPath,
  adminResearchPath,
  draftCommentsPath,
  draftPagePath,
  draftPresencePath,
} from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { AnnotationLayer, Card, Empty, Page, PageHead } from "~/components/page"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import {
  commentsByPath,
  memoComments,
  unresolvedCount,
  wholeComments,
  type CommentView,
} from "~/review/comments"

import { usePanes } from "./admin"
import { Badge, Button, ButtonLink, IconButton, Note, Stack } from "./base"
import { DraftHead, DraftTools, useDraftEditing, useDrawn } from "./draft-tools"
import { DraftNote, WholeNote, type CommentContext } from "./comments"
import { FieldReview, type FieldReviewData } from "./field-review"
import { ResearchBody, ResearchListTable } from "./research"
import {
  ConflictBand,
  FieldHead,
  ItemList,
  PairField,
  ProblemBand,
  Section,
  SingleField,
  StateSwitch,
  UpstreamBand,
  emptyLinksPair,
  emptyPair,
  emptySlot,
  newId,
  type Marks,
} from "./fields"
import { CONTROL } from "./form"
import { Icon } from "./icons"

/**
 * The section a path is written in, which is the first name in it.
 *
 * **A section's anchor is that same first name**, so going to a place named by
 * a band is finding the element with that id. The bands stand outside the
 * sections and name what they are about by path, and nothing between them and
 * the field is hidden.
 */
/** How long the keys have to be still before the pane is redrawn. */

function sectionOf(path: string): string {
  return path.split(".")[0] ?? path
}

export function DraftEditor({ view }: { view: AdminDraftPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.editor
  const words = messages.research

  const review: FieldReviewData = {
    context: {
      locale,
      action: draftCommentsPath(view.researchId, view.draftId),
      subject: RESEARCH,
      canResolve: true,
      signedInName: view.review.signedInName,
    },
    comments: commentsByPath(view.review.comments, RESEARCH),
    changed: view.review.changed,
    previous: view.review.previous,
    heading: view.review.publishedNumber === null
      ? ""
      : messagesFor(locale).preview.previousIn(view.review.publishedNumber),
  }

  const editing = useDraftEditing<DraftInput>({
    initial: view.input,
    revision: view.revision,
    upstream: view.upstream,
    diff: diffDraftInput,
    take: takeField,
    body: (value) => ({ content: value.content }),
  })

  const input = editing.value
  const content = input.content
  const marksFor = editing.marksFor
  const upstream = editing.upstream

  function editContent(produce: (held: ResearchContentInput) => ResearchContentInput): void {
    editing.edit({ ...input, content: produce(content) })
  }

  /**
   * The field's own name for the comment panel's heading — a repeating
   * section's own name for the list itself, and for a field inside one, the
   * name the form gives that field. Read off the path a mark is addressed by,
   * the same one the field itself is written at (`fields.tsx` の `Marks`).
   */
  function fieldLabelFor(path: string): string | undefined {
    const [head, ...rest] = path.split(".")
    const tail = rest.join(".")
    switch (head) {
      case "title": return words.title
      case "releaseNote": return words.releaseNote
      case "summary":
        if (tail === "aims") return words.aims
        if (tail === "methods") return words.methods
        if (tail === "targets") return words.targets
        if (tail === "url") return words.url
        return words.overview
      case "dataProviders":
        if (tail.endsWith("organization.name")) return words.organization
        if (tail.endsWith(".name")) return words.principalInvestigator
        return words.dataProvider
      case "researchProjects":
        if (tail.endsWith(".name")) return words.researchProjectName
        if (tail.endsWith(".url")) return words.url
        return words.researchProjects
      case "grants":
        if (tail.endsWith(".title")) return words.grantTitle
        if (tail.endsWith("agency.name")) return words.grantAgency
        if (tail.endsWith("grantIds")) return t.grantIds
        return words.grants
      case "relatedPublications":
        if (tail.endsWith(".title")) return words.publicationTitle
        if (tail.endsWith(".doi")) return t.doi
        if (tail.endsWith("datasetIds")) return t.citedDatasets
        return words.relatedPublications
      case "listingSummary":
        if (tail === "methods") return words.listingSummary.methods
        if (tail === "targets") return words.listingSummary.targets
        if (tail === "typeOfData") return words.listingSummary.typeOfData
        if (tail === "dataProviders" || tail.endsWith(".name")) return words.listingSummary.dataProviders
        return t.paneRow
      default:
        return undefined
    }
  }

  const body = JSON.stringify({ revision: view.revision, content })
  const pageJa = useDrawn(draftPagePath(view.researchId, view.draftId, "ja"), body,
    locale === "ja" ? view.page : null)
  const pageEn = useDrawn(draftPagePath(view.researchId, view.draftId, "en"), body,
    locale === "en" ? view.page : null)

  /**
   * Where the caret is, as a place in the content rather than a box on screen.
   *
   * **The ja and en boxes of one field are the same place**, so tabbing between
   * them is not a move and the pane beside the form does not redraw or scroll.
   * The place is read off the markup rather than reported by every field
   * (`Stack`'s `at`), so a field added later is found without being told to
   * announce itself.
   */
  const [at, setAt] = useState<string | null>(null)
  function onFormFocus(event: React.FocusEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const found = target.closest("[data-at]")?.getAttribute("data-at")
    if (found !== undefined && found !== null) setAt(found)
  }

  /**
   * Going to the place a band names.
   *
   * **Scrolling is not enough on its own.** An anchor moves the page to the
   * section and leaves the keyboard where it was, so the eye and the caret end
   * up in different places; what is focused here is the first thing in the
   * section that will take it.
   */
  function goTo(path: string): void {
    // The field itself when it stands open on the form; the section holding it
    // when it is written inside a panel that is not open (`ItemList`).
    const field = document.querySelector<HTMLElement>(`[data-at="${CSS.escape(path)}"]`)
    const target = field ?? document.getElementById(sectionOf(path))
    if (target === null) return
    target.scrollIntoView(field === null ? undefined : { block: "center" })
    // The first box that will take it, rather than the first one in the markup:
    // the review layer hangs a comment form beside every field, and its own
    // boxes come first while being hidden, folded away or otherwise unable to
    // hold the caret. Asking each in turn is what tells the two apart.
    for (const box of target.querySelectorAll<HTMLElement>("input, textarea")) {
      box.focus({ preventScroll: true })
      if (document.activeElement === box) return
    }
  }

  /**
   * The same move, for a band that draws its own anchors.
   *
   * The parts that draw the bands write plain `#` links, which scroll without
   * taking the keyboard with them. The click is caught on its way out and
   * answered by `goTo` instead, so that every route to a field lands the same
   * way.
   */
  function onBandJump(event: React.MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const path = target.closest("a[href^='#']")?.getAttribute("href")?.slice(1)
    if (path === undefined) return
    event.preventDefault()
    goTo(path)
  }

  const formBody = (
    <div onFocusCapture={onFormFocus}>
      <Card under={false}>
        <Stack>
          <PublishedBand view={view} onGo={goTo} />

          {editing.conflict !== null && (
            <div onClick={onBandJump}>
              <ConflictBand locale={locale} changed={editing.conflict.changed} />
            </div>
          )}
          {upstream !== null && upstream.differing.length > 0 && (
            <UpstreamBand
              locale={locale}
              differing={upstream.differing}
              number={upstream.number}
              onTakeAll={editing.takeUpstream}
            />
          )}
          {editing.problems.length > 0 && <ProblemBand locale={locale} problems={editing.problems} />}

          <Stack gap="block">
            <Stack gap="block">
              <Section id="title" title={words.title}>
                <PairField
                  value={content.title}
                  marks={marksFor("title")}
                  locale={locale}
                  onChange={(next) => { editContent((c) => ({ ...c, title: next })) }}
                />
              </Section>

              <Section id="releaseNote" title={words.releaseNote}>
                <PairField
                  value={content.releaseNote}
                  multiline
                  marks={marksFor("releaseNote")}
                  locale={locale}
                  onChange={(next) => { editContent((c) => ({ ...c, releaseNote: next })) }}
                />
              </Section>

              <Section id="summary" title={words.overview}>
                {(["aims", "methods", "targets"] as const).map((field) => (
                  <PairField
                    key={field}
                    label={words[field]}
                    value={content.summary[field]}
                    multiline
                    marks={marksFor(`summary.${field}`)}
                    locale={locale}
                    onChange={(next) => {
                      editContent((c) => ({ ...c, summary: { ...c.summary, [field]: next } }))
                    }}
                  />
                ))}
                <LinksField
                  label={words.url}
                  value={content.summary.url}
                  marks={marksFor("summary.url")}
                  locale={locale}
                  onChange={(next) => {
                    editContent((c) => ({ ...c, summary: { ...c.summary, url: next } }))
                  }}
                />
              </Section>
            </Stack>

            <RepeatingSection
              id="dataProviders"
              title={words.dataProvider}
              locale={locale}
              items={content.dataProviders}
              marksFor={marksFor}
              onChange={(next) => { editContent((c) => ({ ...c, dataProviders: next })) }}
              makeEmpty={() => ({
                id: newId(),
                name: emptyPair(),
                organization: { name: emptyPair() },
              })}
              summary={(item) => item.name.ja.text || item.name.en.text}
            >
              {(item, path, set) => (
                <>
                  <PairField
                    label={words.principalInvestigator}
                    value={item.name}
                    marks={marksFor(`${path}.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, name }) }}
                  />
                  <PairField
                    label={words.organization}
                    value={item.organization.name}
                    marks={marksFor(`${path}.organization.name`)}
                    locale={locale}
                    onChange={(name) => {
                      set({ ...item, organization: { ...item.organization, name } })
                    }}
                  />
                </>
              )}
            </RepeatingSection>

            <RepeatingSection
              id="researchProjects"
              title={words.researchProjects}
              locale={locale}
              items={content.researchProjects}
              marksFor={marksFor}
              onChange={(next) => { editContent((c) => ({ ...c, researchProjects: next })) }}
              makeEmpty={() => ({ id: newId(), name: emptyPair(), url: emptyLinksPair() })}
              summary={(item) => item.name.ja.text || item.name.en.text}
            >
              {(item, path, set) => (
                <>
                  <PairField
                    label={words.researchProjectName}
                    value={item.name}
                    marks={marksFor(`${path}.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, name }) }}
                  />
                  <LinksField
                    label={words.url}
                    value={item.url}
                    marks={marksFor(`${path}.url`)}
                    locale={locale}
                    onChange={(url) => { set({ ...item, url }) }}
                  />
                </>
              )}
            </RepeatingSection>

            <RepeatingSection
              id="grants"
              title={words.grants}
              locale={locale}
              items={content.grants}
              marksFor={marksFor}
              onChange={(next) => { editContent((c) => ({ ...c, grants: next })) }}
              makeEmpty={() => ({
                id: newId(),
                title: emptyPair(),
                agency: { name: emptyPair() },
                grantIds: [],
              })}
              summary={(item) => item.title.ja.text || item.title.en.text}
            >
              {(item, path, set) => (
                <>
                  <PairField
                    label={words.grantTitle}
                    value={item.title}
                    marks={marksFor(`${path}.title`)}
                    locale={locale}
                    onChange={(title) => { set({ ...item, title }) }}
                  />
                  <PairField
                    label={words.grantAgency}
                    value={item.agency.name}
                    marks={marksFor(`${path}.agency.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, agency: { name } }) }}
                  />
                  <GrantIds
                    locale={locale}
                    value={item.grantIds}
                    marks={marksFor(`${path}.grantIds`)}
                    onChange={(grantIds) => { set({ ...item, grantIds }) }}
                  />
                </>
              )}
            </RepeatingSection>

            <RepeatingSection
              id="relatedPublications"
              title={words.relatedPublications}
              locale={locale}
              items={content.relatedPublications}
              marksFor={marksFor}
              onChange={(next) => { editContent((c) => ({ ...c, relatedPublications: next })) }}
              makeEmpty={() => ({
                id: newId(),
                title: emptySlot(),
                doi: emptySlot(),
                datasetIds: [],
              })}
              summary={(item) => item.title.text}
            >
              {(item, path, set) => (
                <>
                  <SingleField
                    label={words.publicationTitle}
                    value={item.title}
                    marks={marksFor(`${path}.title`)}
                    locale={locale}
                    onChange={(title) => { set({ ...item, title }) }}
                  />
                  <SingleField
                    label={t.doi}
                    value={item.doi}
                    marks={marksFor(`${path}.doi`)}
                    locale={locale}
                    onChange={(doi) => { set({ ...item, doi }) }}
                  />
                  <Stack gap="tight">
                    <FieldHead
                      label={t.citedDatasets}
                      marks={marksFor(`${path}.datasetIds`)}
                      locale={locale}
                    />
                    <DatasetChecklist
                      locale={locale}
                      datasets={view.datasets}
                      selected={item.datasetIds}
                      onChange={(datasetIds) => { set({ ...item, datasetIds }) }}
                    />
                  </Stack>
                </>
              )}
            </RepeatingSection>

            {/* **The listing's row is not on the page**, so its fields stand
                after everything that is, under the name of the pane that shows
                them (`docs/editing.md` の「フォームの隣に立つ公開ページ」). */}
            <Section id="listingSummary" title={t.paneRow}>
              {(["methods", "targets", "typeOfData"] as const).map((field) => (
                <PairField
                  key={field}
                  label={words.listingSummary[field]}
                  value={content.listingSummary[field]}
                  multiline
                  marks={marksFor(`listingSummary.${field}`)}
                  locale={locale}
                  onChange={(next) => {
                    editContent((c) => ({
                      ...c,
                      listingSummary: { ...c.listingSummary, [field]: next },
                    }))
                  }}
                />
              ))}
              <FieldHead
                label={words.listingSummary.dataProviders}
                marks={marksFor("listingSummary.dataProviders")}
                locale={locale}
              />
              <p className="text-ink-muted text-xs">
                {content.listingSummary.dataProviders.length === 0
                  ? t.listingProvidersFrom(writtenNames(content.dataProviders, locale))
                  : t.listingProvidersOwn}
              </p>
              <ItemList
                path="listingSummary.dataProviders"
                locale={locale}
                items={content.listingSummary.dataProviders}
                title={words.principalInvestigator}
                summary={(item) => item.name.ja.text || item.name.en.text}
                makeEmpty={() => ({ id: newId(), name: emptyPair() })}
                onChange={(next) => {
                  editContent((c) => ({
                    ...c,
                    listingSummary: { ...c.listingSummary, dataProviders: next },
                  }))
                }}
              >
                {(item, path, set) => (
                  <PairField
                    label={words.principalInvestigator}
                    value={item.name}
                    marks={marksFor(`${path}.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, name }) }}
                  />
                )}
              </ItemList>
            </Section>
          </Stack>
        </Stack>
      </Card>
    </div>
  )
  const panes = usePanes({
    locale,
    remember: view.draftId,
    under: "bar",
    contents: [
      { id: "form", label: t.paneForm, body: formBody },
      // The release note is drawn because this is a draft: on a published page
      // the note belongs to the release list, and a draft has none.
      ...([["page", t.panePageJa, "ja", pageJa], ["page-en", t.panePageEn, "en", pageEn]] as const).map(
        ([id, label, language, drawn]) => ({
          id,
          label,
          body: (
            <AnnotationLayer
              /*
                **What the page carries and what the form carries are split by
                whose question it is.** A difference from the published version
                and a comment are about the place a reader looks at, so they
                belong here; a field somebody else moved and markup a save
                refused are about the hands typing, and stay in the form. Drawn
                in both, one thing waiting would appear on the screen twice.
                **Where the caret is** is the page's to show too, on the value
                itself (`page.tsx` の `Place`).
              */
              annotate={(anchor) => <FieldReview review={review} at={anchor} fieldLabel={fieldLabelFor(anchor)} />}
              here={at}
              onGo={goTo}
              goLabel={t.goToField}
            >
              <PageHead
                level="p"
                kicker={words.researchId}
                label={(
                  <>
                    <Icon name="book" aria-hidden="true" />
                    {view.page.humLabel ?? t.unlabelled}
                  </>
                )}
              >
                <Badge onBand>
                  {view.updating === null ? t.draftBadge : t.updatingBadge(`v${view.updating}`)}
                </Badge>
              </PageHead>
              <Card>
                {/* **Nothing is drawn until this language has been drawn.** The
                  other language's page would be the wrong words under the right
                  tab, and the first drawing arrives a keystroke's pause later. */}
                {drawn !== null && <ResearchBody view={drawn.view} locale={language} releaseNote />}
              </Card>
            </AnnotationLayer>
          ),
        })),
      // **The listing's row is a place of its own**: the short summaries are
      // read there and nowhere on the research's page. Both languages stand in
      // the one tab, each under its own column names, because the row is short
      // and the two are checked against each other.
      {
        id: "row",
        label: t.paneRow,
        body: (
          <Card>
            <Stack gap="block">
              {([["ja", pageJa], ["en", pageEn]] as const).map(([language, drawn]) => (
                <Stack key={language} gap="tight">
                  <span className="text-ink-muted text-xs" lang={language}>{language}</span>
                  {drawn !== null && (
                    <ResearchListTable
                      rows={[drawn.row]}
                      locale={language}
                      preview
                      whenEmpty={messagesFor(language).search.none}
                    />
                  )}
                </Stack>
              ))}
            </Stack>
          </Card>
        ),
      },
    ],
  })

  return (
    <Page>
      <Stack>
        {/*
          **The head is left for the research this draft belongs to; the
          tools row is what stays while typing.** Between the two, the head's
          second line reaches this draft's other faces, its memo and the way
          to take a data-providing application in.
        */}
        <DraftHead
          locale={locale}
          title={messages.admin.draft.heading}
          aside={view.humLabel ?? t.unlabelled}
          updating={view.updating}
          back={{
            to: href(locale, adminResearchPath(view.researchId)),
            label: t.backToResearch,
            icon: "chevron-left",
          }}
          overview={(
            <DraftOverview
              locale={locale}
              researchId={view.researchId}
              draftId={view.draftId}
              steps={view.steps}
              review={{
                context: review.context,
                whole: wholeComments(view.review.comments),
                memo: memoComments(view.review.comments),
              }}
            />
          )}
        />
        <DraftTools
          locale={locale}
          panesControl={panes.control}
          unresolved={view.steps.unresolved}
          reviewHref={href(locale, adminDraftReviewPath(view.researchId, view.draftId))}
          dirty={editing.dirty}
          saved={editing.saved}
          saving={editing.saving}
          onSave={editing.save}
          presencePath={draftPresencePath(view.researchId, view.draftId)}
          presence={view.presence}
        />

        {panes.view}
      </Stack>
    </Page>
  )
}

/**
 * What this draft is, read once on the way in: its other three faces (each
 * fact its own way there), the memo, the comments about the whole of it, and
 * the way to take a data-providing application in.
 *
 * **Each fact is the way to the screen it is about** (`docs/editing.md` の
 * 「draft」) — pressing "データセット 3 件" opens the dataset listing, and
 * "未解決 4" opens the review screen. The three stand in the order the work
 * runs in, but none is numbered and none is a step to complete: any of them
 * can be reached from any of the others, and what a curator reads here is how
 * the draft stands rather than what comes next.
 */
function DraftOverview({ locale, researchId, draftId, steps, review }: {
  locale: Locale
  researchId: string
  draftId: string
  steps: DraftStepsView
  review: { context: CommentContext, whole: CommentView[], memo: CommentView[] }
}) {
  const messages = messagesFor(locale)
  const admin = messages.admin
  const detail = admin.detail
  const share = steps.shared ? detail.shared : detail.notShared
  const reviewFact = steps.unresolved > 0 ? `${share}・${detail.unresolved(steps.unresolved)}` : share
  const publishFact = steps.blocks > 0
    ? detail.blocked(steps.blocks)
    : steps.findings > 0 ? detail.toConfirm(steps.findings) : detail.ready

  return (
    <div className="flex flex-wrap items-center gap-4">
      <ButtonLink
        to={href(locale, adminDraftDatasetsPath(researchId, draftId))}
        icon={<Icon name="database" aria-hidden="true" />}
      >
        {`${admin.draft.datasets} ${detail.datasetCount(steps.datasets)}`}
      </ButtonLink>
      <ButtonLink
        to={href(locale, adminDraftReviewPath(researchId, draftId))}
        icon={<Icon name="comment" aria-hidden="true" />}
      >
        {`${admin.review.heading} (${reviewFact})`}
      </ButtonLink>
      <ButtonLink
        to={href(locale, adminDraftPublishPath(researchId, draftId))}
        icon={<Icon name="upload" aria-hidden="true" />}
      >
        {`${admin.publish.heading} (${publishFact})`}
      </ButtonLink>
      <WholeNote context={review.context} comments={review.whole} />
      <DraftNote context={review.context} comments={review.memo} />
      <ButtonLink
        to={href(locale, adminDraftUpstreamPath(researchId, draftId))}
        icon={<Icon name="download" aria-hidden="true" />}
      >
        {admin.templates.openApplication}
      </ButtonLink>
    </div>
  )
}

/**
 * How this draft stands against the version a reader sees now, and what the
 * review has to say. The places are listed rather than only counted: some of
 * them — a list whose membership changed — have no field of their own to mark.
 */
function PublishedBand({ view, onGo }: {
  view: AdminDraftPageView
  onGo: (path: string) => void
}) {
  const t = messagesFor(view.locale).admin.editor
  const review = view.review
  const open = unresolvedCount(review.comments)

  if (review.publishedNumber === null) {
    return <Empty>{t.noPublishedVersion}</Empty>
  }
  if (review.changed.length === 0 && open === 0) return null

  return (
    <Note kind="plain">
      <Stack gap="tight">
        {review.changed.length > 0 && (
          <>
            <p>{t.differsCount(review.publishedNumber, review.changed.length)}</p>
            <ul className="flex flex-wrap gap-2">
              {review.changed.map((path) => (
                <li key={path}>
                  {/* Each one goes to that field, and the mark is what says so:
                      a bare path in a row of paths reads as a list, not as
                      places to press (`docs/ui.md` の「押せるもの」). */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    icon={<Icon name="chevron-right" aria-hidden="true" />}
                    onClick={() => { onGo(path) }}
                  >
                    {path}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {open > 0 && (
          <p>
            <Link to={href(view.locale, adminDraftReviewPath(view.researchId, view.draftId))}>
              {messagesFor(view.locale).admin.detail.openComments(open)}
            </Link>
          </p>
        )}
      </Stack>
    </Note>
  )
}

/**
 * The names the provider column would show if the listing named none of its
 * own, as one line. **Read from the form and not from the listing's own view**,
 * so that a name being typed into the section above is reflected while it is
 * being typed.
 *
 * Either language, whichever is written: this is a curator being shown what the
 * table will say, and a name written only in Japanese still answers that.
 */
function writtenNames(providers: DataProviderInput[], locale: Locale): string {
  const written = providers
    .map((provider) => provider.name[locale].text.trim() || provider.name.ja.text.trim()
      || provider.name.en.text.trim())
    .filter((name) => name !== "")
  return written.join("、")
}

/**
 * A part of the form holding a list of one kind of thing: providers, projects,
 * grants, papers.
 *
 * The four differ in what one element holds and in what an empty one looks
 * like. **Everything around that is the same in all four** — the mark for the
 * list itself, a card per element carrying its own way to move and remove it,
 * and the way to add one more — and four copies of it would be four things able
 * to drift apart.
 *
 * **The anchor is the path the list is addressed by** (`TAB_OF`), so a band
 * naming a place inside one of these elements can find the section holding it.
 */
function RepeatingSection<T extends { id: string }>({
  id,
  title,
  locale,
  items,
  marksFor,
  onChange,
  makeEmpty,
  summary,
  children,
}: {
  id: string
  title: string
  locale: Locale
  items: T[]
  marksFor: (path: string) => Marks
  onChange: (next: T[]) => void
  /** One more of whatever the list holds, with nothing written in it yet. */
  makeEmpty: () => T
  /** What one element is, in a line, for the card that stands for it. */
  summary: (item: T) => string
  /** One element's own fields, given the path it is addressed by and its setter. */
  children: (item: T, path: string, set: (next: T) => void) => ReactNode
}) {
  return (
    <Section id={id} title={title}>
      {/* The list is the section's one field, so the heading is its name; the
          line under it holds only what the review says about the list. */}
      <FieldHead marks={marksFor(id)} locale={locale} />
      <ItemList
        path={id}
        locale={locale}
        items={items}
        title={title}
        summary={summary}
        onChange={onChange}
        makeEmpty={makeEmpty}
      >
        {children}
      </ItemList>
    </Section>
  )
}

/**
 * A URL pair. The two languages are different resources rather than two
 * renderings of one, so nothing here is ever untranslated.
 */
function LinksField({ label, value, marks, locale, onChange }: {
  label: string
  value: LinksPairInput
  marks: Marks
  locale: Locale
  onChange: (next: LinksPairInput) => void
}) {
  const t = messagesFor(locale).admin.editor

  return (
    <Stack gap="tight" at={marks.at}>
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="grid gap-4 md:grid-cols-2">
        {(["ja", "en"] as const).map((language) => {
          const side = value[language]
          const setLinks = (links: LinkInput[]) => {
            onChange({ ...value, [language]: { ...side, links } })
          }
          return (
            <Stack key={language} gap="tight">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-muted text-xs" lang={language}>{language}</span>
                <StateSwitch
                  state={side.state}
                  onChange={(state) => { onChange({ ...value, [language]: { ...side, state } }) }}
                  locale={locale}
                />
              </div>
              {side.links.map((link, at) => (
                <div key={link.id} className="flex flex-wrap items-center gap-1">
                  <input
                    type="text"
                    aria-label={t.url}
                    placeholder={t.url}
                    className={`${CONTROL} min-w-40 flex-1 text-sm`}
                    disabled={side.state !== "value"}
                    value={link.url}
                    onChange={(event) => {
                      setLinks(side.links.map((row, index) =>
                        index === at ? { ...row, url: event.target.value } : row))
                    }}
                  />
                  <input
                    type="text"
                    aria-label={t.linkText}
                    placeholder={t.linkText}
                    className={`${CONTROL} min-w-32 flex-1 text-sm`}
                    disabled={side.state !== "value"}
                    value={link.text}
                    onChange={(event) => {
                      setLinks(side.links.map((row, index) =>
                        index === at ? { ...row, text: event.target.value } : row))
                    }}
                  />
                  <IconButton
                    name="trash"
                    label={t.remove}
                    onClick={() => { setLinks(side.links.filter((_, index) => index !== at)) }}
                  />
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  icon={<Icon name="plus" aria-hidden="true" />}
                  disabled={side.state !== "value"}
                  onClick={() => { setLinks([...side.links, { id: newId(), url: "", text: "" }]) }}
                >
                  {t.addLink}
                </Button>
              </div>
            </Stack>
          )
        })}
      </div>
    </Stack>
  )
}

/**
 * The numbers a grant is known by.
 *
 * They are plain strings with no identity of their own, so a row is addressed by
 * where it stands — which is also why the whole list is one path to the diff and
 * carries one mark rather than one per number.
 */
function GrantIds({ locale, value, marks, onChange }: {
  locale: Locale
  value: string[]
  marks: Marks
  onChange: (next: string[]) => void
}) {
  const t = messagesFor(locale).admin.editor

  return (
    <Stack gap="tight" at={marks.at}>
      <FieldHead label={t.grantIds} marks={marks} locale={locale} />
      <div className="md:max-w-md">
        <Stack gap="tight">
          {value.map((grantId, at) => (
            <div key={at} className="flex items-center gap-1">
              <input
                type="text"
                aria-label={t.grantIds}
                className={`${CONTROL} flex-1 text-sm`}
                value={grantId}
                onChange={(event) => {
                  onChange(value.map((row, index) => index === at ? event.target.value : row))
                }}
              />
              <IconButton
                name="trash"
                label={t.remove}
                onClick={() => { onChange(value.filter((_, index) => index !== at)) }}
              />
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              icon={<Icon name="plus" aria-hidden="true" />}
              onClick={() => { onChange([...value, ""]) }}
            >
              {t.addGrantId}
            </Button>
          </div>
        </Stack>
      </div>
    </Stack>
  )
}

function datasetName(row: ResearchDatasetRow, locale: Locale): string {
  return row.label ?? messagesFor(locale).admin.editor.unpinnedDataset
}

/** Which datasets a publication covers. A set, so there is no order to keep. */
function DatasetChecklist({ locale, datasets, selected, onChange }: {
  locale: Locale
  datasets: ResearchDatasetRow[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const t = messagesFor(locale).admin.editor
  if (datasets.length === 0) return <Empty>{t.noDatasets}</Empty>

  return (
    <ul className="flex flex-wrap gap-3 text-sm">
      {datasets.map((row) => (
        <li key={row.id}>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selected.includes(row.id)}
              onChange={(event) => {
                onChange(event.target.checked
                  ? [...selected, row.id]
                  : selected.filter((id) => id !== row.id))
              }}
            />
            {datasetName(row, locale)}
          </label>
        </li>
      ))}
    </ul>
  )
}
