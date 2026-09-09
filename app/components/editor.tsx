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
 * **The document is cut into tabs and every field stays in it.** One save
 * carries the whole draft, so moving between tabs can lose nothing; what the
 * tabs change is how much of one document stands between a curator and the part
 * of it they came to write.
 */

import { useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { Link } from "react-router"

import { diffDraftInput, takeField } from "~/admin/diff"
import type {
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
  adminDraftReviewPath,
  adminResearchPath,
  draftCommentsPath,
  draftPresencePath,
  draftUndoPath,
} from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { Page } from "~/components/page"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import { threadsByPath, unresolvedCount } from "~/review/comments"

import { Badge, Button, Note, SectionTabs, Stack, TabPanel, type Tone } from "./base"
import { DraftBar, useDraftEditing } from "./draft-tools"
import { FieldReview, type FieldReviewData } from "./field-review"
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
 * The parts of the form, in the order they are offered.
 *
 * **Four of the six hold one repeated list each**, because a list grows with the
 * research and carries its own adding, ordering and removing — put together they
 * would be one tab as long as the whole screen was before there were any. The
 * first holds everything written once about the research, none of which depends
 * on how many of anything there are.
 */
const TABS = [
  "overview",
  "dataProviders",
  "researchProjects",
  "grants",
  "relatedPublications",
  "datasets",
] as const

type Tab = (typeof TABS)[number]

/**
 * Which tab a path is edited on, by the first name in it.
 *
 * The bands stand outside the tabs and name the places they are about by path,
 * so going to one means opening the tab that holds it first: a field inside a
 * panel that is not showing is `hidden`, and nothing can be moved to a place
 * with no position. **A section's anchor is that same first name**, which is
 * what makes one table enough to find both the tab and the element.
 */
const TAB_OF: Record<string, Tab> = {
  title: "overview",
  summary: "overview",
  listingSummary: "overview",
  releaseNote: "overview",
  dataProviders: "dataProviders",
  researchProjects: "researchProjects",
  grants: "grants",
  relatedPublications: "relatedPublications",
  datasetIds: "datasets",
}

/**
 * The four things a place can be waiting for, and how urgent each one is.
 *
 * Markup a save refused has to be dealt with before anything can be saved at
 * all; a field somebody else moved is a choice to make; a comment is to be read;
 * a difference from the published version is only where the work has been done.
 * **The order they are written in is the order they win in.**
 */
const MARK_TONE = {
  problem: "danger",
  conflict: "accent",
  comment: "brand",
  differs: "muted",
} as const satisfies Record<string, Tone>

type MarkKind = keyof typeof MARK_TONE

function tabOf(path: string): Tab | undefined {
  return TAB_OF[path.split(".")[0] ?? path]
}

export function DraftEditor({ view }: { view: AdminDraftPageView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.editor
  const words = messagesFor(locale).research
  const [current, setCurrent] = useState<string>(TABS[0])

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
    extraFor: (path) => <FieldReview review={review} at={path} />,
  })

  const input = editing.value
  const content = input.content
  const marksFor = editing.marksFor
  const upstream = editing.upstream

  function editContent(produce: (held: ResearchContentInput) => ResearchContentInput): void {
    editing.edit({ ...input, content: produce(content) })
  }

  /**
   * Going to the place a band names.
   *
   * The tab holding it is opened first and that change is flushed: the panel is
   * `hidden` until React has drawn it again, and an element with no position
   * cannot be scrolled to. What is focused afterwards is the first thing in the
   * section that can be typed in, so the keyboard arrives where the eye does.
   */
  function goTo(path: string): void {
    const at = path.split(".")[0] ?? path
    const tab = TAB_OF[at]
    if (tab !== undefined) {
      flushSync(() => {
        setCurrent(tab)
      })
    }
    const section = document.getElementById(at)
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
   * The parts that draw the bands know nothing about tabs, so a link to a field
   * on a tab that is not showing lands on a `hidden` element and does nothing at
   * all. The click is caught on its way out and answered here instead.
   */
  function onBandJump(event: React.MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const path = target.closest("a[href^='#']")?.getAttribute("href")?.slice(1)
    if (path === undefined) return
    event.preventDefault()
    goTo(path)
  }

  // Every place waiting for something, most pressing first (`MARK_TONE`).
  const waiting: { kind: MarkKind, paths: string[] }[] = [
    { kind: "problem", paths: editing.problems.map((problem) => problem.path) },
    {
      kind: "conflict",
      paths: [
        ...editing.conflict?.changed ?? [],
        ...upstream?.only ?? [],
        ...upstream?.both ?? [],
      ],
    },
    {
      kind: "comment",
      paths: Object.entries(review.threads)
        .filter(([, threads]) => unresolvedCount(threads) > 0)
        .map(([path]) => path),
    },
    { kind: "differs", paths: view.review.changed },
  ]

  /**
   * What is waiting on a tab, since the marks beside its fields are hidden along
   * with them.
   *
   * **One badge rather than one per kind.** The strip is read across in a
   * glance, and numbers side by side get compared rather than counted; the
   * colour says which kind is the most pressing one there, and the word beside
   * it says the same to anybody not looking.
   */
  function markOf(tab: Tab): ReactNode {
    const here = waiting.filter((group) => group.paths.some((path) => tabOf(path) === tab))
    const first = here[0]
    if (first === undefined) return undefined
    const places = new Set(
      here.flatMap((group) => group.paths).filter((path) => tabOf(path) === tab),
    )
    return (
      <Badge tone={MARK_TONE[first.kind]}>
        {places.size}
        <span className="sr-only">{t.marks[first.kind]}</span>
      </Badge>
    )
  }

  return (
    <Page>
      <Stack>
        <DraftBar
          locale={locale}
          heading={view.humLabel ?? t.heading}
          links={[
            { to: href(locale, adminResearchPath(view.researchId)), label: t.backToResearch },
            {
              to: href(locale, adminDraftDatasetsPath(view.researchId, view.draftId)),
              label: messagesFor(locale).admin.draft.datasets,
            },
            {
              to: href(locale, adminDraftReviewPath(view.researchId, view.draftId)),
              label: t.review,
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
          <SectionTabs
            label={t.tabsLabel}
            tabs={TABS.map((id) => ({
              id,
              label: id === "overview" ? t.tabOverview : t.sections[id],
              mark: markOf(id),
            }))}
            current={current}
            onSelect={setCurrent}
          />
        </DraftBar>

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
          <p className="text-ink-muted text-sm">{t.noteHint}</p>
          <textarea
            className={`${CONTROL} w-full text-sm`}
            rows={3}
            value={input.note}
            onChange={(event) => { editing.edit({ ...input, note: event.target.value }) }}
          />
        </Section>

        <Stack gap="block">
          <TabPanel id="overview" current={current}>
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
          </TabPanel>

          <TabPanel id="dataProviders" current={current}>
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
          </TabPanel>

          <TabPanel id="researchProjects" current={current}>
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
          </TabPanel>

          <TabPanel id="grants" current={current}>
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
          </TabPanel>

          <TabPanel id="relatedPublications" current={current}>
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
          </TabPanel>

          <TabPanel id="datasets" current={current}>
            <Section id="datasetIds" title={t.sections.datasets}>
              <p className="text-ink-muted text-sm">{t.selectDatasets}</p>
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
          </TabPanel>
        </Stack>
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
    return <p className="text-ink-muted text-sm">{t.noPublishedVersion}</p>
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
  const t = messagesFor(locale).admin.editor

  return (
    <Section id={id} title={title}>
      <FieldHead label={title} marks={marksFor(id)} locale={locale} />
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
            `${id}.${item.id}`,
            (next) => { onChange(replacing(items, item.id, next)) },
          )}
        </ElementCard>
      ))}
      <AddElement label={t.add} onClick={() => { onChange([...items, makeEmpty()]) }} />
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
    <Stack gap="tight">
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
    <Stack gap="tight">
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
    return <p className="text-ink-muted text-sm">{t.noDatasets}</p>
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
  if (datasets.length === 0) return <p className="text-ink-muted text-sm">{t.noDatasets}</p>

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
