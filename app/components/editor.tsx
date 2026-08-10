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
 */

import { useState } from "react"
import { Link, useFetcher, type SubmitTarget } from "react-router"

import { diffDraftInput, takeField } from "~/admin/diff"
import { takeAll } from "~/admin/merge"
import type {
  DataProviderInput,
  DraftInput,
  GrantInput,
  LinkInput,
  LinksPairInput,
  RelatedPublicationInput,
  ResearchContentInput,
  ResearchProjectInput,
} from "~/admin/form"
import { researchContentInput } from "~/admin/form"
import type { FieldProblem } from "~/admin/form.server"
import type { AdminDraftPageView, SaveResult } from "~/admin/pages.server"
import type { ResearchDatasetRow } from "~/admin/queries.server"
import {
  adminDraftDatasetsPath,
  adminResearchPath,
  draftPresencePath,
  draftUndoPath,
} from "~/admin/urls"
import type { DraftSnapshot } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { PresenceLine, UndoMenu } from "./draft-tools"
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

const SECTIONS = [
  "note",
  "title",
  "summary",
  "summaryShort",
  "releaseNote",
  "dataProviders",
  "researchProjects",
  "grants",
  "relatedPublications",
  "datasets",
] as const

export function DraftEditor({ view }: { view: AdminDraftPageView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.editor
  const fetcher = useFetcher<SaveResult>()
  const undoFetcher = useFetcher<DraftSnapshot>()

  const [input, setInput] = useState<DraftInput>(view.input)
  const [base, setBase] = useState<DraftInput>(view.input)
  const [revision, setRevision] = useState(view.revision)
  const [conflict, setConflict] = useState<{ theirs: DraftInput, changed: string[] } | null>(null)
  const [upstream, setUpstream] = useState(view.upstream)
  const [problems, setProblems] = useState<FieldProblem[]>([])
  const [saved, setSaved] = useState(false)

  // What the pending save carried, so that a success can record it as the
  // version the server now holds without depending on what has been typed since.
  const [sent, setSent] = useState<DraftInput>(view.input)
  const [answered, setAnswered] = useState<SaveResult | null>(null)
  const [restored, setRestored] = useState<DraftSnapshot | null>(null)

  // The answer is taken while rendering rather than in an effect: it is one
  // state derived from another, not a message to an outside system, and the
  // fields the other version moved have to be worked out against the version
  // this screen still holds — after which that version is replaced.
  const answer = fetcher.state === "idle" ? fetcher.data : undefined
  if (answer !== undefined && answer !== answered) {
    setAnswered(answer)
    setSaved(answer.status === "saved")
    if (answer.status === "saved") {
      setRevision(answer.revision)
      setBase(sent)
      setConflict(null)
      setProblems([])
    } else if (answer.status === "invalid") {
      setProblems(answer.problems)
    } else {
      setConflict({ theirs: answer.current, changed: diffDraftInput(base, answer.current) })
      setRevision(answer.revision)
      setBase(answer.current)
      setProblems([])
    }
  }

  // A snapshot taken off the stack is put into the form and left there. It is
  // unsaved work like any other until somebody presses save, which is what
  // keeps going back from being a way around the revision check.
  const snapshot = undoFetcher.state === "idle" ? undoFetcher.data : undefined
  if (snapshot !== undefined && snapshot !== restored) {
    setRestored(snapshot)
    setInput({ note: snapshot.note, content: researchContentInput(snapshot.content) })
    setSaved(false)
    setProblems([])
  }

  const dirty = diffDraftInput(base, input).length > 0

  function edit(next: DraftInput): void {
    setInput(next)
    setSaved(false)
  }

  function editContent(produce: (content: ResearchContentInput) => ResearchContentInput): void {
    edit({ ...input, content: produce(input.content) })
  }

  function save(): void {
    setSent(input)
    // The payload is a plain JSON document. `SubmitTarget` describes one as a
    // type with an index signature, which a named interface never satisfies.
    const payload = { revision, note: input.note, content: input.content } as unknown as SubmitTarget
    void fetcher.submit(payload, { method: "post", encType: "application/json" })
  }

  /**
   * Taking everything only the other publish touched. What both sides touched
   * is left where it is: each of those is a choice, and the mark beside the
   * field is where it is made.
   */
  function takeUpstream(): void {
    if (upstream === null) return
    edit(takeAll(takeField, input, upstream.theirs, upstream.only))
    setUpstream({ ...upstream, only: [] })
  }

  /**
   * A field can be marked from two directions — a save somebody refused, and a
   * publish that moved what this draft started from. The refusal wins when both
   * apply: it is the more recent of the two.
   */
  function marksFor(path: string): Marks {
    const refused = conflict?.changed.includes(path) ?? false
    const moved = upstream?.both.includes(path) ?? false
    const theirs = refused ? conflict?.theirs : moved ? upstream?.theirs : undefined
    return {
      changed: refused || moved,
      onTake: theirs === undefined
        ? null
        : () => {
            edit(takeField(input, theirs, path))
            if (!refused && upstream !== null) {
              setUpstream({ ...upstream, both: upstream.both.filter((held) => held !== path) })
            }
          },
      problems: problems.filter((problem) => problem.path.startsWith(`${path}.`)),
    }
  }

  const content = input.content

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <TopBar
        view={view}
        dirty={dirty}
        saving={fetcher.state !== "idle"}
        saved={saved}
        onSave={save}
        onUndo={(undoId) => {
          void undoFetcher.load(draftUndoPath(view.researchId, view.draftId, undoId))
        }}
        undoLoading={undoFetcher.state !== "idle"}
      />

      {conflict !== null && (
        <ConflictBand locale={locale} changed={conflict.changed} />
      )}
      {upstream !== null && (upstream.only.length > 0 || upstream.both.length > 0) && (
        <UpstreamBand
          locale={locale}
          only={upstream.only}
          both={upstream.both}
          onTakeAll={takeUpstream}
        />
      )}
      {problems.length > 0 && <ProblemBand locale={locale} problems={problems} />}

      <Section id="note" title={t.sections.note}>
        <p className="mb-2 text-ink-muted text-sm">{t.noteHint}</p>
        <textarea
          className="w-full rounded-sm border border-line px-2 py-1 text-sm"
          rows={3}
          value={input.note}
          onChange={(event) => { edit({ ...input, note: event.target.value }) }}
        />
      </Section>

      <Section id="title" title={t.sections.title}>
        <PairField
          label={messagesFor(locale).research.title}
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
            label={messagesFor(locale).research[field]}
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
          label={messagesFor(locale).research.url}
          value={content.summary.url}
          marks={marksFor("summary.url")}
          locale={locale}
          onChange={(next) => {
            editContent((c) => ({ ...c, summary: { ...c.summary, url: next } }))
          }}
        />
      </Section>

      <Section id="summaryShort" title={t.sections.summaryShort}>
        {(["methods", "targets", "typeOfData"] as const).map((field) => (
          <PairField
            key={field}
            label={field === "typeOfData"
              ? messagesFor(locale).dataset.typeOfData
              : messagesFor(locale).research[field]}
            value={content.summaryShort[field]}
            multiline
            marks={marksFor(`summaryShort.${field}`)}
            locale={locale}
            onChange={(next) => {
              editContent((c) => ({ ...c, summaryShort: { ...c.summaryShort, [field]: next } }))
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

      <ProvidersSection
        locale={locale}
        items={content.dataProviders}
        marksFor={marksFor}
        onChange={(next) => { editContent((c) => ({ ...c, dataProviders: next })) }}
      />

      <ProjectsSection
        locale={locale}
        items={content.researchProjects}
        marksFor={marksFor}
        onChange={(next) => { editContent((c) => ({ ...c, researchProjects: next })) }}
      />

      <GrantsSection
        locale={locale}
        items={content.grants}
        marksFor={marksFor}
        onChange={(next) => { editContent((c) => ({ ...c, grants: next })) }}
      />

      <PublicationsSection
        locale={locale}
        items={content.relatedPublications}
        datasets={view.datasets}
        marksFor={marksFor}
        onChange={(next) => { editContent((c) => ({ ...c, relatedPublications: next })) }}
      />

      <Section id="datasets" title={t.sections.datasets}>
        <p className="mb-2 text-ink-muted text-sm">{t.selectDatasets}</p>
        <FieldHead label={t.sections.datasets} marks={marksFor("datasetIds")} locale={locale} />
        <DatasetOrder
          locale={locale}
          datasets={view.datasets}
          selected={content.datasetIds}
          onChange={(next) => { editContent((c) => ({ ...c, datasetIds: next })) }}
        />
      </Section>
    </div>
  )
}

function TopBar({ view, dirty, saving, saved, onSave, onUndo, undoLoading }: {
  view: AdminDraftPageView
  dirty: boolean
  saving: boolean
  saved: boolean
  onSave: () => void
  onUndo: (undoId: string) => void
  undoLoading: boolean
}) {
  const locale = view.locale
  const t = messagesFor(locale).admin.editor
  return (
    <div className="sticky top-0 z-10 mb-4 border-line border-b bg-white py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-bold text-lg">{view.humLabel ?? t.heading}</h1>
          <Link to={href(locale, adminResearchPath(view.researchId))} className="text-sm">
            {t.backToResearch}
          </Link>
          <Link
            to={href(locale, adminDraftDatasetsPath(view.researchId, view.draftId))}
            className="text-sm"
          >
            {messagesFor(locale).admin.draft.datasets}
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {dirty && <span className="text-accent">{t.unsaved}</span>}
          {!dirty && saved && <span className="text-ink-muted">{t.saved}</span>}
          <UndoMenu
            locale={locale}
            entries={view.undo}
            onPick={onUndo}
            loading={undoLoading}
          />
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="cursor-pointer rounded-sm bg-brand px-4 py-1.5 font-semibold text-white disabled:opacity-60"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
      <PresenceLine
        locale={locale}
        path={draftPresencePath(view.researchId, view.draftId)}
        initial={view.presence}
      />
      <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SECTIONS.map((section) => (
          <a key={section} href={`#${section}`}>{t.sections[section]}</a>
        ))}
      </nav>
    </div>
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
    <div className="mt-4">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="mt-1 grid gap-3 md:grid-cols-2">
        {(["ja", "en"] as const).map((language) => {
          const side = value[language]
          const setLinks = (links: LinkInput[]) => {
            onChange({ ...value, [language]: { ...side, links } })
          }
          return (
            <div key={language} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-muted text-xs">{language}</span>
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
                    className="min-w-40 flex-1 rounded-sm border border-line px-2 py-1 text-sm"
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
                    className="min-w-32 flex-1 rounded-sm border border-line px-2 py-1 text-sm"
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface SectionProps<T> {
  locale: Locale
  items: T[]
  marksFor: (path: string) => Marks
  onChange: (next: T[]) => void
}

function ProvidersSection({ locale, items, marksFor, onChange }: SectionProps<DataProviderInput>) {
  const t = messagesFor(locale).admin.editor
  const words = messagesFor(locale).research

  return (
    <Section id="dataProviders" title={t.sections.dataProviders}>
      <FieldHead label={t.sections.dataProviders} marks={marksFor("dataProviders")} locale={locale} />
      {items.map((item, at) => {
        const path = `dataProviders.${item.id}`
        const set = (next: DataProviderInput) => {
          onChange(replacing(items, item.id, next))
        }
        return (
          <ElementCard
            key={item.id}
            index={at}
            count={items.length}
            locale={locale}
            onMove={(by) => { onChange(moved(items, at, by)) }}
            onRemove={() => { onChange(items.filter((row) => row.id !== item.id)) }}
          >
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
          </ElementCard>
        )
      })}
      <AddElement
        label={t.add}
        onClick={() => {
          onChange([...items, {
            id: newId(),
            name: emptyPair(),
            organization: { name: emptyPair(), address: emptyPair() },
            orcid: emptySlot(),
            email: emptySlot(),
          }])
        }}
      />
    </Section>
  )
}

function ProjectsSection({ locale, items, marksFor, onChange }: SectionProps<ResearchProjectInput>) {
  const t = messagesFor(locale).admin.editor
  const words = messagesFor(locale).research

  return (
    <Section id="researchProjects" title={t.sections.researchProjects}>
      <FieldHead
        label={t.sections.researchProjects}
        marks={marksFor("researchProjects")}
        locale={locale}
      />
      {items.map((item, at) => {
        const path = `researchProjects.${item.id}`
        const set = (next: ResearchProjectInput) => {
          onChange(replacing(items, item.id, next))
        }
        return (
          <ElementCard
            key={item.id}
            index={at}
            count={items.length}
            locale={locale}
            onMove={(by) => { onChange(moved(items, at, by)) }}
            onRemove={() => { onChange(items.filter((row) => row.id !== item.id)) }}
          >
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
          </ElementCard>
        )
      })}
      <AddElement
        label={t.add}
        onClick={() => {
          onChange([...items, { id: newId(), name: emptyPair(), url: emptyLinksPair() }])
        }}
      />
    </Section>
  )
}

function GrantsSection({ locale, items, marksFor, onChange }: SectionProps<GrantInput>) {
  const t = messagesFor(locale).admin.editor
  const words = messagesFor(locale).research

  return (
    <Section id="grants" title={t.sections.grants}>
      <FieldHead label={t.sections.grants} marks={marksFor("grants")} locale={locale} />
      {items.map((item, at) => {
        const path = `grants.${item.id}`
        const set = (next: GrantInput) => {
          onChange(replacing(items, item.id, next))
        }
        return (
          <ElementCard
            key={item.id}
            index={at}
            count={items.length}
            locale={locale}
            onMove={(by) => { onChange(moved(items, at, by)) }}
            onRemove={() => { onChange(items.filter((row) => row.id !== item.id)) }}
          >
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
            <div className="mt-4">
              <FieldHead
                label={t.grantIds}
                marks={marksFor(`${path}.grantIds`)}
                locale={locale}
              />
              <div className="mt-1 flex flex-col gap-1 md:max-w-md">
                {item.grantIds.map((grantId, index) => (
                  <div key={index} className="flex items-center gap-1">
                    <input
                      type="text"
                      aria-label={t.grantIds}
                      className="flex-1 rounded-sm border border-line px-2 py-1 text-sm"
                      value={grantId}
                      onChange={(event) => {
                        set({
                          ...item,
                          grantIds: item.grantIds.map((row, position) =>
                            position === index ? event.target.value : row),
                        })
                      }}
                    />
                    <RowButton
                      label={t.remove}
                      onClick={() => {
                        set({
                          ...item,
                          grantIds: item.grantIds.filter((_, position) => position !== index),
                        })
                      }}
                    />
                  </div>
                ))}
                <div>
                  <RowButton
                    label={t.addGrantId}
                    onClick={() => { set({ ...item, grantIds: [...item.grantIds, ""] }) }}
                  />
                </div>
              </div>
            </div>
          </ElementCard>
        )
      })}
      <AddElement
        label={t.add}
        onClick={() => {
          onChange([...items, {
            id: newId(),
            title: emptyPair(),
            agency: { name: emptyPair() },
            grantIds: [],
          }])
        }}
      />
    </Section>
  )
}

function PublicationsSection({ locale, items, datasets, marksFor, onChange }:
  SectionProps<RelatedPublicationInput> & { datasets: ResearchDatasetRow[] }) {
  const t = messagesFor(locale).admin.editor
  const words = messagesFor(locale).research

  return (
    <Section id="relatedPublications" title={t.sections.relatedPublications}>
      <FieldHead
        label={t.sections.relatedPublications}
        marks={marksFor("relatedPublications")}
        locale={locale}
      />
      {items.map((item, at) => {
        const path = `relatedPublications.${item.id}`
        const set = (next: RelatedPublicationInput) => {
          onChange(replacing(items, item.id, next))
        }
        return (
          <ElementCard
            key={item.id}
            index={at}
            count={items.length}
            locale={locale}
            onMove={(by) => { onChange(moved(items, at, by)) }}
            onRemove={() => { onChange(items.filter((row) => row.id !== item.id)) }}
          >
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
            <div className="mt-4">
              <FieldHead
                label={t.citedDatasets}
                marks={marksFor(`${path}.datasetIds`)}
                locale={locale}
              />
              <DatasetChecklist
                locale={locale}
                datasets={datasets}
                selected={item.datasetIds}
                onChange={(datasetIds) => { set({ ...item, datasetIds }) }}
              />
            </div>
          </ElementCard>
        )
      })}
      <AddElement
        label={t.add}
        onClick={() => {
          onChange([...items, {
            id: newId(),
            title: emptySlot(),
            doi: emptySlot(),
            datasetIds: [],
          }])
        }}
      />
    </Section>
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
    <div className="mt-2 flex flex-col gap-2">
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
              <RowButton label={t.moveUp} disabled={at === 0} onClick={() => { onChange(moved(selected, at, -1)) }} />
              <RowButton
                label={t.moveDown}
                disabled={at === selected.length - 1}
                onClick={() => { onChange(moved(selected, at, 1)) }}
              />
              <RowButton
                label={t.remove}
                onClick={() => { onChange(selected.filter((row2) => row2 !== id)) }}
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
    </div>
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
    <ul className="mt-1 flex flex-wrap gap-3 text-sm">
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
