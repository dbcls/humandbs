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

import { useEffect, useState, type ReactNode } from "react"
import { Link, useFetcher } from "react-router"

import { diffDraftInput, takeField } from "~/admin/diff"
import type {
  DataProviderInput,
  DraftInput,
  LinkInput,
  LinksPairInput,
  ResearchContentInput,
} from "~/admin/form"
import { researchContentInput } from "~/admin/form"
import type { AdminDraftPageView } from "~/admin/pages.server"
import type { ResearchDatasetRow } from "~/admin/queries.server"
import {
  adminDraftDatasetsPath,
  adminDraftPublishPath,
  adminDraftReviewPath,
  adminResearchListPath,
  adminResearchPath,
  draftCommentsPath,
  draftPagePath,
  draftPresencePath,
  draftUndoPath,
} from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { AnnotationLayer, Empty, Page } from "~/components/page"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import { threadsByPath, unresolvedCount } from "~/review/comments"
import type { DrawnDraft } from "~/review/preview.server"

import { AdminCrumbs, PaneSpot, usePanes } from "./admin"
import { Button, Note, Stack } from "./base"
import { DraftBar, useDraftEditing } from "./draft-tools"
import { FieldReview, type FieldReviewData } from "./field-review"
import { ResearchBody } from "./research"
import {
  AddElement,
  ConflictBand,
  ElementCard,
  FieldHead,
  PairField,
  ProblemBand,
  RowButton,
  Section,
  SingleField,
  StateSwitch,
  UpstreamBand,
  emptyLinksPair,
  emptyPair,
  emptySlot,
  moved,
  newId,
  replacing,
  type Marks,
} from "./fields"
import { CONTROL } from "./form"

/**
 * The section a path is written in, which is the first name in it.
 *
 * **A section's anchor is that same first name**, so going to a place named by
 * a band is finding the element with that id. The bands stand outside the
 * sections and name what they are about by path, and nothing between them and
 * the field is hidden.
 */
/** How long the keys have to be still before the pane is redrawn. */
const DRAW_AFTER = 300

function sectionOf(path: string): string {
  return path.split(".")[0] ?? path
}

export function DraftEditor({ view }: { view: AdminDraftPageView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.editor
  const words = messagesFor(locale).research

  const review: FieldReviewData = {
    context: {
      locale,
      action: href(locale, draftCommentsPath(view.researchId, view.draftId)),
      subject: RESEARCH,
      canResolve: true,
      signedInName: view.review.signedInName,
    },
    threads: threadsByPath(view.review.threads, RESEARCH),
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
    body: (value) => ({ note: value.note, content: value.content }),
    fromSnapshot: (snapshot) => ({
      note: snapshot.note,
      content: researchContentInput(snapshot.content),
    }),
    undoPath: (undoId) => draftUndoPath(view.researchId, view.draftId, undoId),
  })

  const input = editing.value
  const content = input.content
  const marksFor = editing.marksFor
  const upstream = editing.upstream

  function editContent(produce: (held: ResearchContentInput) => ResearchContentInput): void {
    editing.edit({ ...input, content: produce(content) })
  }

  /**
   * The pane catching up with what is being typed.
   *
   * **It waits for the keys to stop.** Drawing the page is a round trip, and
   * one per keystroke would be a request per letter for an answer nobody has
   * time to read; a pause is also when somebody looks up at it.
   *
   * **The same content is not asked for twice.** Moving the caret, marking a
   * value unsettled and back, or undoing to where it already was all leave the
   * content as it was, and the pane has nothing to redraw.
   *
   * **Prose the tree cannot hold leaves the pane on the page as it was loaded.**
   * Refusing markup is the save's job and it says where the problem is; the
   * drawing answers with nothing rather than with half a page, and comes back
   * as soon as the prose parses again.
   */
  const drawing = useFetcher<DrawnDraft | null>()
  const submit = drawing.submit
  const drawAt = href(locale, draftPagePath(view.researchId, view.draftId, locale))
  const body = JSON.stringify({ revision: view.revision, note: input.note, content })
  useEffect(() => {
    const waiting = setTimeout(() => {
      void submit(body, { method: "post", action: drawAt, encType: "application/json" })
    }, DRAW_AFTER)
    return () => {
      clearTimeout(waiting)
    }
  }, [body, drawAt, submit])

  const page = drawing.data ?? view.page

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
    const section = document.getElementById(sectionOf(path))
    if (section === null) return
    section.scrollIntoView()
    // The first box that will take it, rather than the first one in the markup:
    // the review layer hangs a comment form beside every field, and its own
    // boxes come first while being hidden, folded away or otherwise unable to
    // hold the caret. Asking each in turn is what tells the two apart.
    for (const box of section.querySelectorAll<HTMLElement>("input, textarea")) {
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
      <Stack>
        <PublishedBand view={view} onGo={goTo} />

        {editing.conflict !== null && (
          <div onClick={onBandJump}>
            <ConflictBand locale={locale} changed={editing.conflict.changed} />
          </div>
        )}
        {upstream !== null && (upstream.only.length > 0 || upstream.both.length > 0) && (
          <UpstreamBand
            locale={locale}
            only={upstream.only}
            both={upstream.both}
            onTakeAll={editing.takeUpstream}
          />
        )}
        {editing.problems.length > 0 && <ProblemBand locale={locale} problems={editing.problems} />}

        {/* The memo is about the draft rather than about the research: it never
            reaches a reader, and looking for it under a tab named after a part
            of the description would be looking in the wrong place. */}
        <Section id="note" title={t.sections.note}>
          <Empty>{t.noteHint}</Empty>
          <textarea
            className={`${CONTROL} w-full text-sm`}
            rows={3}
            value={input.note}
            onChange={(event) => { editing.edit({ ...input, note: event.target.value }) }}
          />
        </Section>

        <Stack gap="block">
          <Stack gap="block">
            <Section id="title" title={t.sections.title}>
              <PairField
                label={words.title}
                value={content.title}
                marks={marksFor("title")}
                locale={locale}
                onChange={(next) => { editContent((c) => ({ ...c, title: next })) }}
              />
            </Section>

            <Section id="summary" title={t.sections.summary}>
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

            <Section id="listingSummary" title={t.sections.listingSummary}>
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
              <RepeatingList
                path="listingSummary.dataProviders"
                locale={locale}
                items={content.listingSummary.dataProviders}
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
                    label={words.representative}
                    value={item.name}
                    marks={marksFor(`${path}.name`)}
                    locale={locale}
                    onChange={(name) => { set({ ...item, name }) }}
                  />
                )}
              </RepeatingList>
            </Section>

            <Section id="releaseNote" title={t.sections.releaseNote}>
              <PairField
                label={t.sections.releaseNote}
                value={content.releaseNote}
                multiline
                marks={marksFor("releaseNote")}
                locale={locale}
                onChange={(next) => { editContent((c) => ({ ...c, releaseNote: next })) }}
              />
            </Section>
          </Stack>

          <RepeatingSection
            id="dataProviders"
            title={t.sections.dataProviders}
            locale={locale}
            items={content.dataProviders}
            marksFor={marksFor}
            onChange={(next) => { editContent((c) => ({ ...c, dataProviders: next })) }}
            makeEmpty={() => ({
              id: newId(),
              name: emptyPair(),
              organization: { name: emptyPair(), address: emptyPair() },
              orcid: emptySlot(),
              email: emptySlot(),
            })}
          >
            {(item, path, set) => (
              <>
                <PairField
                  label={words.representative}
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
                <PairField
                  label={t.address}
                  value={item.organization.address}
                  marks={marksFor(`${path}.organization.address`)}
                  locale={locale}
                  onChange={(address) => {
                    set({ ...item, organization: { ...item.organization, address } })
                  }}
                />
                <SingleField
                  label={t.orcid}
                  value={item.orcid}
                  marks={marksFor(`${path}.orcid`)}
                  locale={locale}
                  onChange={(orcid) => { set({ ...item, orcid }) }}
                />
                <SingleField
                  label={t.email}
                  value={item.email}
                  marks={marksFor(`${path}.email`)}
                  locale={locale}
                  onChange={(email) => { set({ ...item, email }) }}
                />
              </>
            )}
          </RepeatingSection>

          <RepeatingSection
            id="researchProjects"
            title={t.sections.researchProjects}
            locale={locale}
            items={content.researchProjects}
            marksFor={marksFor}
            onChange={(next) => { editContent((c) => ({ ...c, researchProjects: next })) }}
            makeEmpty={() => ({ id: newId(), name: emptyPair(), url: emptyLinksPair() })}
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
            title={t.sections.grants}
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
            title={t.sections.relatedPublications}
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

          <Section id="datasetIds" title={t.sections.datasets}>
            <Empty>{t.selectDatasets}</Empty>
            <Stack gap="tight">
              <FieldHead
                label={t.sections.datasets}
                marks={marksFor("datasetIds")}
                locale={locale}
              />
              <DatasetOrder
                locale={locale}
                datasets={view.datasets}
                selected={content.datasetIds}
                onChange={(next) => { editContent((c) => ({ ...c, datasetIds: next })) }}
              />
            </Stack>
          </Section>
        </Stack>
      </Stack>
    </div>
  )
  const panes = usePanes({
    locale,
    remember: view.draftId,
    contents: [
      { id: "form", label: t.paneForm, body: formBody },
      {
        id: "page",
        label: t.panePage,
        // The release note is drawn because this is a draft: on a published
        // page the note belongs to the release list, and a draft has none.
        body: (
          <AnnotationLayer
            annotate={(anchor) => (
              <>
                {/*
                  **What the page carries and what the form carries are split by
                  whose question it is.** A difference from the published version
                  and a comment are about the place a reader looks at, so they
                  belong here; a field somebody else moved and markup a save
                  refused are about the hands typing, and stay in the form. Drawn
                  in both, one thing waiting would appear on the screen twice.
                */}
                <FieldReview review={review} at={anchor} />
                <PaneSpot
                  here={anchor === at}
                  label={t.goToField}
                  onGo={() => { goTo(anchor) }}
                />
              </>
            )}
          >
            <ResearchBody view={page.view} locale={locale} releaseNote />
          </AnnotationLayer>
        ),
      },
    ],
  })

  return (
    <Page>
      <AdminCrumbs
        locale={locale}
        trail={[
          {
            label: messagesFor(locale).admin.research.heading,
            to: href(locale, adminResearchListPath()),
          },
          {
            label: view.humLabel ?? messagesFor(locale).admin.detail.heading,
            to: href(locale, adminResearchPath(view.researchId)),
          },
        ]}
        current={t.heading}
      />
      <Stack>
        {/*
          **The links beside the name are the way across, not the way back.**
          The trail above holds the way out of here; what a curator reaches from
          this screen and nowhere else is the draft's other two faces.
        */}
        <DraftBar
          locale={locale}
          heading={view.humLabel ?? t.heading}
          links={[
            {
              to: href(locale, adminDraftDatasetsPath(view.researchId, view.draftId)),
              label: messagesFor(locale).admin.draft.datasets,
            },
            {
              to: href(locale, adminDraftReviewPath(view.researchId, view.draftId)),
              label: t.review,
            },
            {
              to: href(locale, adminDraftPublishPath(view.researchId, view.draftId)),
              label: messagesFor(locale).admin.publish.open,
            },
          ]}
          dirty={editing.dirty}
          saved={editing.saved}
          saving={editing.saving}
          onSave={editing.save}
          undo={view.undo}
          onUndo={editing.undo}
          undoLoading={editing.undoLoading}
          presencePath={draftPresencePath(view.researchId, view.draftId)}
          presence={view.presence}
        >
          {panes.control}
        </DraftBar>

        {panes.view}
      </Stack>
    </Page>
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
  const open = unresolvedCount(review.threads)

  if (review.publishedNumber === null) {
    return <Empty>{t.noPublishedVersion}</Empty>
  }
  if (review.changed.length === 0 && open === 0) return null

  return (
    <Note kind="plain">
      <Stack gap="tight">
        {review.changed.length > 0 && (
          <>
            <p>{t.differsCount(review.changed.length)}</p>
            <ul className="flex flex-wrap gap-2">
              {review.changed.map((path) => (
                <li key={path}>
                  <Button type="button" variant="ghost" size="xs" onClick={() => { onGo(path) }}>
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
  /** One element's own fields, given the path it is addressed by and its setter. */
  children: (item: T, path: string, set: (next: T) => void) => ReactNode
}) {
  return (
    <Section id={id} title={title}>
      <FieldHead label={title} marks={marksFor(id)} locale={locale} />
      <RepeatingList
        path={id}
        locale={locale}
        items={items}
        onChange={onChange}
        makeEmpty={makeEmpty}
      >
        {children}
      </RepeatingList>
    </Section>
  )
}

/**
 * The cards themselves, without the section around them.
 *
 * A list of one kind of thing is usually the whole of a section, and
 * `RepeatingSection` is that case. **A list that sits among other fields cannot
 * open a second section**: the path a band jumps to is resolved to an element by
 * its first name, so a nested section would give one name two places to land.
 */
function RepeatingList<T extends { id: string }>({
  path,
  locale,
  items,
  onChange,
  makeEmpty,
  children,
}: {
  /** What one element's path opens with. */
  path: string
  locale: Locale
  items: T[]
  onChange: (next: T[]) => void
  makeEmpty: () => T
  children: (item: T, path: string, set: (next: T) => void) => ReactNode
}) {
  const t = messagesFor(locale).admin.editor

  return (
    <>
      {items.map((item, at) => (
        <ElementCard
          key={item.id}
          index={at}
          count={items.length}
          locale={locale}
          onMove={(by) => { onChange(moved(items, at, by)) }}
          onRemove={() => { onChange(items.filter((row) => row.id !== item.id)) }}
        >
          {children(
            item,
            `${path}.${item.id}`,
            (next) => { onChange(replacing(items, item.id, next)) },
          )}
        </ElementCard>
      ))}
      <AddElement label={t.add} onClick={() => { onChange([...items, makeEmpty()]) }} />
    </>
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
                  <RowButton
                    label={t.remove}
                    onClick={() => { setLinks(side.links.filter((_, index) => index !== at)) }}
                  />
                </div>
              ))}
              <div>
                <RowButton
                  label={t.addLink}
                  disabled={side.state !== "value"}
                  onClick={() => { setLinks([...side.links, { id: newId(), url: "", text: "" }]) }}
                />
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
              <RowButton
                label={t.remove}
                onClick={() => { onChange(value.filter((_, index) => index !== at)) }}
              />
            </div>
          ))}
          <div>
            <RowButton label={t.addGrantId} onClick={() => { onChange([...value, ""]) }} />
          </div>
        </Stack>
      </div>
    </Stack>
  )
}

function datasetName(row: ResearchDatasetRow, locale: Locale): string {
  return row.label ?? messagesFor(locale).admin.editor.unpinnedDataset
}

/**
 * The datasets a version lists, in the order it lists them.
 *
 * An id that names nothing is shown as gone rather than as itself. It happens:
 * another draft can destroy a dataset it introduced while this one still lists
 * it, and a save that lists a dataset of no research is refused — so the row
 * has to say what is wrong beside the button that fixes it.
 */
function DatasetOrder({ locale, datasets, selected, onChange }: {
  locale: Locale
  datasets: ResearchDatasetRow[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const t = messagesFor(locale).admin.editor
  const byId = new Map(datasets.map((row) => [row.id, row]))
  const unselected = datasets.filter((row) => !selected.includes(row.id))

  if (datasets.length === 0 && selected.length === 0) {
    return <Empty>{t.noDatasets}</Empty>
  }

  return (
    <Stack gap="tight">
      <ol className="flex flex-col gap-1">
        {selected.map((id, at) => {
          const row = byId.get(id)
          return (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className={`min-w-40 ${row === undefined ? "text-danger" : ""}`}>
                {row === undefined ? t.missingDataset : datasetName(row, locale)}
              </span>
              {row?.published === false && (
                <span className="text-ink-muted text-xs">
                  {messagesFor(locale).admin.detail.unpublishedDataset}
                </span>
              )}
              <RowButton
                label={t.moveUp}
                disabled={at === 0}
                onClick={() => { onChange(moved(selected, at, -1)) }}
              />
              <RowButton
                label={t.moveDown}
                disabled={at === selected.length - 1}
                onClick={() => { onChange(moved(selected, at, 1)) }}
              />
              <RowButton
                label={t.remove}
                onClick={() => { onChange(selected.filter((held) => held !== id)) }}
              />
            </li>
          )
        })}
      </ol>
      <ul className="flex flex-wrap gap-2">
        {unselected.map((row) => (
          <li key={row.id}>
            <RowButton
              label={`${t.add}: ${datasetName(row, locale)}`}
              onClick={() => { onChange([...selected, row.id]) }}
            />
          </li>
        ))}
      </ul>
    </Stack>
  )
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
