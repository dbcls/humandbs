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
 * of them is split into panels. Nothing is hidden, so an indicator beside a field is
 * always where the field is.
 */

import { useRef, useState, type ReactNode } from "react"

import { describeAt } from "~/admin/changes"
import { diffDraftInput, importField } from "~/admin/diff"
import type {
  DataProviderInput,
  DraftInput,
  LinksPairInput,
  SlotState,
  TextInput,
  ResearchContentInput,
} from "~/admin/form"
import type { AdminDraftPageView } from "~/admin/pages.server"
import {
  adminDraftDatasetsPath,
  adminDraftPublishPath,
  adminDraftReviewPath,
  adminDraftImportPath,
  adminResearchPath,
  draftCommentsPath,
  draftPagePath,
} from "~/admin/urls"
import type { CommentAnchor } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { AnnotationLayer, Card, Page, PageHeader } from "~/components/page"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import {
  commentsByPath,
  memoComments,
  wholeComments,
} from "~/review/comments"

import { usePanes, ScreenLink } from "./admin"
import { Badge, Stack } from "./base"
import { DraftHead, DraftTools, useDraftEditing, useDrawn } from "./draft-tools"
import { DraftNote, OpenComments, WholeNote } from "./comments"
import { FieldReview, type FieldReviewData } from "./field-review"
import { ResearchBody, ResearchListTable } from "./research"
import { CitableTable, datasetName, GrantIds, IdList, LinksField, researchFieldLabel } from "./research-fields"
import {
  ConflictBanner,
  emptyLinksPair,
  emptyPair,
  emptySlot,
  FieldFlags,
  FieldHead,
  isUntranslated,
  type ItemColumn,
  ItemList,
  LanguageLabel,
  type FieldAnnotations,
  newId,
  PairField,
  Section,
  SingleField,
} from "./fields"
import { focusField } from "./form"
import { Icon } from "./icons"

/**
 * The section a path is written in, which is the first name in it.
 *
 * **A section's anchor is that same first name**, so going to a place named by
 * a banner is finding the element with that id. The banners are shown outside the
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
    // Read when an indicator opens, by which time the editing state below exists.
    current: (at) => describeAt(editing.value.content, at),
    heading: view.review.publishedNumber === null
      ? ""
      : messagesFor(locale).preview.previousIn(view.review.publishedNumber),
  }

  const editing = useDraftEditing<DraftInput>({
    initial: view.input,
    revision: view.revision,
    diff: diffDraftInput,
    importAt: importField,
    body: (value) => ({ content: value.content }),
  })

  const input = editing.value
  const content = input.content
  const annotationsFor = editing.annotationsFor

  function editContent(produce: (held: ResearchContentInput) => ResearchContentInput): void {
    editing.edit({ ...input, content: produce(content) })
  }

  /**
   * The field's own name for the comment panel's heading — a repeating
   * section's own name for the list itself, and for a field inside one, the
   * name the form gives that field. Read off the path an indicator is addressed by,
   * the same one the field itself is written at (`fields.tsx` の `FieldAnnotations`).
   */
  function fieldLabelFor(path: string): string | undefined {
    return researchFieldLabel(path, locale)
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
  /** The form, when a pane shows it: the only place a jump may focus (`focusField`). */
  const form = useRef<HTMLDivElement>(null)
  function onFormFocus(event: React.FocusEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const found = target.closest("[data-at]")?.getAttribute("data-at")
    if (found !== undefined && found !== null) setAt(found)
  }

  /**
   * Going to the place a banner or the page pane names (`form.tsx` の `focusField`):
   * the field when it is open on the form, the element's row when the field
   * is written in a panel that is not open (`ItemList`), else the section.
   */
  function goTo(path: string): void {
    focusField(form.current, path, sectionOf(path))
  }

  /**
   * What to call the place an open comment is about (`OpenComments`).
   *
   * **The screen's own words, never a path.** `summary.aims` and
   * `values.01a0…` are how the content addresses a place, not how anybody
   * reading the panel knows it; a field this form draws is called what its
   * label calls it, and a field of a dataset is called by that dataset, which
   * is the screen it is written on.
   */
  function nameOf(anchor: CommentAnchor): string {
    switch (anchor.kind) {
      case "research-field":
        return fieldLabelFor(anchor.path) ?? anchor.path
      case "dataset-field": {
        const dataset = view.datasets.find((one) => one.id === anchor.datasetId)
        return dataset?.label ?? t.unpinnedDataset
      }
      default:
        return t.whole
    }
  }

  /**
   * The same move, for a banner that draws its own anchors.
   *
   * The parts that draw the banners write plain `#` links, which scroll without
   * taking the keyboard with them. The click is caught on its way out and
   * answered by `goTo` instead, so that every route to a field focuses the same
   * way.
   */
  function onHeaderBarJump(event: React.MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const path = target.closest("a[href^='#']")?.getAttribute("href")?.slice(1)
    if (path === undefined) return
    event.preventDefault()
    goTo(path)
  }

  const formBody = (
    <div ref={form} onFocusCapture={onFormFocus}>
      <Card under={false}>
        <Stack>
          {editing.conflict !== null && (
            <div onClick={onHeaderBarJump}>
              <ConflictBanner locale={locale} changed={editing.conflict.changed} />
            </div>
          )}

          <Stack gap="block">
            <Stack gap="block">
              <Section
                id="title"
                title={words.title}
                flags={<FieldFlags annotations={annotationsFor("title")} locale={locale} untranslated={isUntranslated(content.title)} />}
              >
                <PairField
                  value={content.title}
                  annotations={annotationsFor("title")}
                  locale={locale}
                  onChange={(next) => { editContent((c) => ({ ...c, title: next })) }}
                />
              </Section>

              <Section
                id="releaseNote"
                title={words.releaseNote}
                accepts={messages.admin.accepts.prose}
                flags={<FieldFlags annotations={annotationsFor("releaseNote")} locale={locale} untranslated={isUntranslated(content.releaseNote)} />}
              >
                <PairField
                  value={content.releaseNote}
                  multiline
                  annotations={annotationsFor("releaseNote")}
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
                    annotations={annotationsFor(`summary.${field}`)}
                    locale={locale}
                    onChange={(next) => {
                      editContent((c) => ({ ...c, summary: { ...c.summary, [field]: next } }))
                    }}
                  />
                ))}
                <LinksField
                  label={words.url}
                  value={content.summary.url}
                  annotations={annotationsFor("summary.url")}
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
              annotationsFor={annotationsFor}
              onChange={(next) => { editContent((c) => ({ ...c, dataProviders: next })) }}
              makeEmpty={() => ({
                id: newId(),
                name: emptyPair(),
                organization: { name: emptyPair() },
              })}
              columns={[
                { header: words.principalInvestigator, cell: (item) => pairCell(item.name, t.stateChoice) },
                { header: words.organization, cell: (item) => pairCell(item.organization.name, t.stateChoice) },
              ]}
            >
              {(item, path, set) => (
                <>
                  <PairField
                    label={words.principalInvestigator}
                    value={item.name}
                    annotations={annotationsFor(`${path}.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, name }) }}
                  />
                  <PairField
                    label={words.organization}
                    value={item.organization.name}
                    annotations={annotationsFor(`${path}.organization.name`)}
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
              annotationsFor={annotationsFor}
              onChange={(next) => { editContent((c) => ({ ...c, researchProjects: next })) }}
              makeEmpty={() => ({ id: newId(), name: emptyPair(), url: emptyLinksPair() })}
              columns={[
                { header: words.researchProjectName, cell: (item) => pairCell(item.name, t.stateChoice) },
                { header: words.url, cell: (item) => <LinkLines links={item.url} /> },
              ]}
            >
              {(item, path, set) => (
                <>
                  <PairField
                    label={words.researchProjectName}
                    value={item.name}
                    annotations={annotationsFor(`${path}.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, name }) }}
                  />
                  <LinksField
                    label={words.url}
                    value={item.url}
                    annotations={annotationsFor(`${path}.url`)}
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
              annotationsFor={annotationsFor}
              onChange={(next) => { editContent((c) => ({ ...c, grants: next })) }}
              makeEmpty={() => ({
                id: newId(),
                title: emptyPair(),
                agency: { name: emptyPair() },
                grantIds: [],
              })}
              columns={[
                { header: words.grantAgency, cell: (item) => pairCell(item.agency.name, t.stateChoice) },
                { header: words.grantTitle, cell: (item) => pairCell(item.title, t.stateChoice) },
                // A line each, as the page draws them: several numbers on one
                // line run into one long code.
                { header: words.grantId, cell: (item) => (
                  <ul className="flex flex-col items-start gap-1">
                    {item.grantIds.filter((grantId) => grantId !== "").map((grantId) => (
                      <li key={grantId}><Badge pill>{grantId}</Badge></li>
                    ))}
                  </ul>
                ) },
              ]}
            >
              {(item, path, set) => (
                <>
                  <PairField
                    label={words.grantTitle}
                    value={item.title}
                    annotations={annotationsFor(`${path}.title`)}
                    locale={locale}
                    onChange={(title) => { set({ ...item, title }) }}
                  />
                  <PairField
                    label={words.grantAgency}
                    value={item.agency.name}
                    annotations={annotationsFor(`${path}.agency.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, agency: { name } }) }}
                  />
                  <GrantIds
                    locale={locale}
                    value={item.grantIds}
                    annotations={annotationsFor(`${path}.grantIds`)}
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
              annotationsFor={annotationsFor}
              onChange={(next) => { editContent((c) => ({ ...c, relatedPublications: next })) }}
              makeEmpty={() => ({
                id: newId(),
                title: emptySlot(),
                doi: emptySlot(),
                datasetIds: [],
                externalIds: [],
              })}
              wide
              columns={[
                { header: words.publicationTitle, cell: (item) => slotCell(item.title, t.stateChoice) },
                { header: t.doi, cell: (item) => <span className="break-all">{slotCell(item.doi, t.stateChoice)}</span> },
                { header: messages.dataset.datasetId, cell: (item) => (
                  <ul className="flex flex-col gap-1">
                    {view.datasets
                      .filter((row) => item.datasetIds.includes(row.id))
                      .map((row) => <li key={row.id}>{datasetName(row, locale)}</li>)}
                    {item.externalIds
                      .filter((id) => id.trim() !== "")
                      .map((id) => <li key={`external-${id}`}>{id}</li>)}
                  </ul>
                ) },
              ]}
            >
              {(item, path, set) => (
                <>
                  <SingleField
                    label={words.publicationTitle}
                    value={item.title}
                    annotations={annotationsFor(`${path}.title`)}
                    locale={locale}
                    wide
                    onChange={(title) => { set({ ...item, title }) }}
                  />
                  <SingleField
                    label={t.doi}
                    value={item.doi}
                    annotations={annotationsFor(`${path}.doi`)}
                    locale={locale}
                    wide
                    hint={t.doiHint}
                    onChange={(doi) => { set({ ...item, doi }) }}
                  />
                  <Stack gap="tight">
                    <FieldHead
                      label={messages.dataset.datasetId}
                      annotations={annotationsFor(`${path}.datasetIds`)}
                      locale={locale}
                    />
                    <CitableTable
                      locale={locale}
                      datasets={view.citable}
                      selected={item.datasetIds}
                      onChange={(datasetIds) => { set({ ...item, datasetIds }) }}
                    />
                  </Stack>
                  {/* The column on the page is one place for both, so this
                      list is addressed by the same path; the indicators are shown once,
                      with the table above. */}
                  <IdList
                    label={t.externalIds}
                    itemLabel={t.externalIds}
                    addLabel={t.addExternalId}
                    hint={t.externalIdsHint}
                    placeholder={t.externalIdPlaceholder}
                    locale={locale}
                    value={item.externalIds}
                    annotations={{ at: `${path}.datasetIds`, changed: false, onImport: null }}
                    onChange={(externalIds) => { set({ ...item, externalIds }) }}
                  />
                </>
              )}
            </RepeatingSection>

            {/* **The listing's row is not on the page**, so its fields stand
                after everything that is, under the name of the pane that shows
                them. */}
            <Section id="listingSummary" title={t.paneRow}>
              {(["methods", "targets", "typeOfData"] as const).map((field) => (
                <PairField
                  key={field}
                  label={words.listingSummary[field]}
                  value={content.listingSummary[field]}
                  multiline
                  annotations={annotationsFor(`listingSummary.${field}`)}
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
                annotations={annotationsFor("listingSummary.dataProviders")}
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
                columns={[{ header: words.principalInvestigator, cell: (item) => pairCell(item.name, t.stateChoice) }]}
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
                    annotations={annotationsFor(`${path}.name`)}
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
                **What the page has and what the form has are split by
                whose question it is.** A difference from the published version
                and a comment are about the place a reader looks at, so they
                belong here; a field somebody else moved and markup a save
                refused are about the hands typing, and stay in the form. Drawn
                in both, one thing waiting would appear on the screen twice.
                **Where the caret is** is the page's to show too, on the value
                itself (`page.tsx` の `ValueAtPath`).
              */
              annotate={(anchor) => <FieldReview review={review} at={anchor} fieldLabel={fieldLabelFor(anchor)} drawn={drawn} />}
              here={at}
              onGo={goTo}
              goLabel={t.goToField}
            >
              <PageHeader
                level="p"
                kicker={words.researchId}
                label={(
                  <>
                    <Icon name="book" aria-hidden="true" />
                    {view.page.humLabel ?? t.unlabelled}
                  </>
                )}
              >
                <Badge onHeaderBar icon={<Icon name="edit" aria-hidden="true" />}>
                  {view.updating === null ? t.draftBadge : t.updatingBadge(`v${view.updating}`)}
                </Badge>
              </PageHeader>
              <Card>
                {/* **Nothing is drawn until this language has been drawn.** The
                  other language's page would be the wrong words under the right
                  tab, and the first drawing arrives a keystroke's pause later. */}
                {drawn !== null && <ResearchBody view={drawn.view} locale={language} releaseNote writtenOnly />}
              </Card>
            </AnnotationLayer>
          ),
        })),
      // **The listing's row is a place of its own**: the short summaries are
      // read there and nowhere on the research's page. Both languages are shown in
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
                  <LanguageLabel language={language} />
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
          **The header is left for the research this draft belongs to, and collapses
          to its toolbar while typing.** Its second line reaches this draft's
          other screens, its memo and the way to import a data-providing
          application in.
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
            />
          )}
          tools={(
            <DraftTools
              locale={locale}
              panesControl={panes.control}
              // **Memo, the whole, then what is still open** — from what only
              // the office reads to what the office has to reply to.
              notes={(
                <>
                  <DraftNote context={review.context} comments={memoComments(view.review.comments)} />
                  <WholeNote context={review.context} comments={wholeComments(view.review.comments)} />
                  <OpenComments context={review.context} comments={view.review.comments} nameOf={nameOf} />
                </>
              )}
              dirty={editing.dirty}
              saved={editing.saved}
              saving={editing.saving}
              onSave={editing.save}
            />
          )}
        />

        {panes.view}
      </Stack>
    </Page>
  )
}

/**
 * The draft's other screens, as the links to them: importing an application, the
 * datasets, review and sharing, publishing — in the order the work goes, but
 * named only, never numbered. **Each is styled as the back link, with the
 * chevron after the word** (`admin.tsx` の `ScreenLink`): all four lead to another
 * screen, and the row under them is where things are done in place. **The
 * facts are not here** — how many datasets, whether it is shared, what stops
 * publishing — each screen shows its own on arrival, and what is still open is
 * counted in the toolbar.
 */
function DraftOverview({ locale, researchId, draftId }: {
  locale: Locale
  researchId: string
  draftId: string
}) {
  const admin = messagesFor(locale).admin
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ScreenLink to={href(locale, adminDraftImportPath(researchId, draftId))} icon="download">
        {admin.import.open}
      </ScreenLink>
      <ScreenLink to={href(locale, adminDraftDatasetsPath(researchId, draftId))} icon="database">
        {admin.draft.datasets}
      </ScreenLink>
      <ScreenLink to={href(locale, adminDraftReviewPath(researchId, draftId))} icon="comment">
        {admin.review.heading}
      </ScreenLink>
      <ScreenLink to={href(locale, adminDraftPublishPath(researchId, draftId))} icon="upload">
        {admin.publish.heading}
      </ScreenLink>
    </div>
  )
}

/**
 * The names the provider column would show if the listing named none of its
 * own, as one line. **Read from the form and not from the listing's own view**,
 * so that a name being typed into the section above is reflected while it is
 * being typed.
 *
 * Either language, whichever is written: this is a curator being shown what the
 * table will show, and a name written only in Japanese still serves for that.
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
 * The four differ in what one element holds, in what an empty one looks like
 * and in which columns the table shows. **Everything around that is the same
 * in all four** — the indicator for the list itself, a row per element with its
 * own way to open, move and remove it, and the way to add one more — and four
 * copies of it would be four things able to drift apart.
 *
 * **The anchor is the path the list is addressed by** (`TAB_OF`), so a banner
 * naming a place inside one of these elements can find the section holding it.
 */
function RepeatingSection<T extends { id: string }>({
  id,
  title,
  locale,
  items,
  annotationsFor,
  onChange,
  makeEmpty,
  columns,
  wide = false,
  children,
}: {
  id: string
  title: string
  locale: Locale
  items: T[]
  annotationsFor: (path: string) => FieldAnnotations
  onChange: (next: T[]) => void
  /** One more of whatever the list holds, with nothing written in it yet. */
  makeEmpty: () => T
  /** The table's columns — the public page's for the same list (`fields.tsx` の `ItemList`). */
  columns: ItemColumn<T>[]
  /** Whether an element's panel holds a table (`ItemList` の `wide`). */
  wide?: boolean
  /** One element's own fields, given the path it is addressed by and its setter. */
  children: (item: T, path: string, set: (next: T) => void) => ReactNode
}) {
  return (
    // The list is the section's one field, so the heading is its name and
    // shows what the review has found about the list.
    <Section id={id} title={title} flags={<FieldFlags annotations={annotationsFor(id)} locale={locale} />}>
      <ItemList
        path={id}
        locale={locale}
        items={items}
        title={title}
        columns={columns}
        onChange={onChange}
        makeEmpty={makeEmpty}
        wide={wide}
      >
        {children}
      </ItemList>
    </Section>
  )
}

/** The words for the two states a side can be set to instead of a value (`admin.editor.stateChoice`). */
type StateWords = Record<Exclude<SlotState, "value">, string>

/**
 * What one side of a value shows in a line: its text, or the word for the
 * state it is set to instead. A side marked unsettled or not applicable has no
 * text to show, and a row showing 未入力 for it would suggest the curator has not
 * answered when they have.
 */
function sideLine(side: TextInput, states: StateWords): { text: string, isState: boolean } {
  return side.state === "value" ? { text: side.text, isState: false } : { text: states[side.state], isState: true }
}

/** The Japanese side, or the English while the Japanese side is a value with nothing typed. */
function pairLine(pair: { ja: TextInput, en: TextInput }, states: StateWords): { text: string, isState: boolean } {
  const ja = sideLine(pair.ja, states)
  return ja.text !== "" ? ja : sideLine(pair.en, states)
}

/** A line as a table cell: a state's word in the muted style of a collapsed field (`fields.tsx`), a value as it is. */
function lineCell(line: { text: string, isState: boolean }): ReactNode {
  return line.isState ? <span className="text-ink-muted">{line.text}</span> : line.text
}

function pairCell(pair: { ja: TextInput, en: TextInput }, states: StateWords): ReactNode {
  return lineCell(pairLine(pair, states))
}

function slotCell(slot: TextInput, states: StateWords): ReactNode {
  return lineCell(sideLine(slot, states))
}

/** A pair of link lists as lines, the way the page draws them: a link's text, or its address. */
function LinkLines({ links }: { links: LinksPairInput }) {
  const shown = links.ja.links.length > 0 ? links.ja.links : links.en.links
  return (
    <ul className="flex flex-col gap-1 break-all">
      {shown.map((link) => <li key={link.id}>{link.text !== "" ? link.text : link.url}</li>)}
    </ul>
  )
}
