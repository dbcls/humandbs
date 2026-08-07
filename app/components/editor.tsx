/**
 * The screen a research draft is written on.
 *
 * Everything is held in one piece of state and posted as one document, because
 * a version of a research is one thing: half of it saved is not a state anybody
 * asked for. **What is typed is never taken away.** Marking a field unsettled
 * keeps the half-written text beside it, refused markup comes back attached to
 * the field it was written in, and a save rejected because somebody else got
 * there first leaves the form exactly as it was and offers their version one
 * field at a time.
 *
 * The two languages sit side by side and carry a state each, so a title settled
 * in Japanese while the English is still a question put to the provider is one
 * row rather than two fields that have to be kept in step.
 */

import { useState } from "react"
import { Link, useFetcher, type SubmitTarget } from "react-router"

import { diffDraftInput, takeField } from "~/admin/diff"
import type {
  DataProviderInput,
  DraftInput,
  GrantInput,
  LinkInput,
  LinksPairInput,
  RelatedPublicationInput,
  ResearchContentInput,
  ResearchProjectInput,
  SlotState,
  TextInput,
  TextPairInput,
} from "~/admin/form"
import type { FieldProblem } from "~/admin/form.server"
import type { AdminDraftPageView, SaveResult } from "~/admin/pages.server"
import type { ResearchDatasetRow } from "~/admin/queries.server"
import { adminResearchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

const STATES: readonly SlotState[] = ["value", "unknown", "not-applicable"]

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

/** Everything a field needs to know about the two ways a save can come back. */
interface Marks {
  changed: boolean
  onTake: (() => void) | null
  problems: FieldProblem[]
}

function newId(): string {
  return crypto.randomUUID()
}

function emptySlot(): TextInput {
  return { state: "value", text: "" }
}

function emptyPair(): TextPairInput {
  return { ja: emptySlot(), en: emptySlot() }
}

function emptyLinks(): LinksPairInput {
  return { ja: { state: "value", links: [] }, en: { state: "value", links: [] } }
}

/** A pair is untranslated when both sides hold a value and one of them is empty. */
function isUntranslated(pair: TextPairInput): boolean {
  return pair.ja.state === "value"
    && pair.en.state === "value"
    && (pair.ja.text === "") !== (pair.en.text === "")
}

function moved<T>(items: readonly T[], from: number, by: number): T[] {
  const to = from + by
  if (to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const [taken] = next.splice(from, 1)
  if (taken !== undefined) next.splice(to, 0, taken)
  return next
}

function replacing<T extends { id: string }>(items: readonly T[], id: string, next: T): T[] {
  return items.map((item) => item.id === id ? next : item)
}

export function DraftEditor({ view }: { view: AdminDraftPageView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.editor
  const fetcher = useFetcher<SaveResult>()

  const [input, setInput] = useState<DraftInput>(view.input)
  const [base, setBase] = useState<DraftInput>(view.input)
  const [revision, setRevision] = useState(view.revision)
  const [conflict, setConflict] = useState<{ theirs: DraftInput, changed: string[] } | null>(null)
  const [problems, setProblems] = useState<FieldProblem[]>([])
  const [saved, setSaved] = useState(false)

  // What the pending save carried, so that a success can record it as the
  // version the server now holds without depending on what has been typed since.
  const [sent, setSent] = useState<DraftInput>(view.input)
  const [answered, setAnswered] = useState<SaveResult | null>(null)

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

  function marksFor(path: string): Marks {
    const changed = conflict?.changed.includes(path) ?? false
    const theirs = conflict?.theirs
    return {
      changed,
      onTake: changed && theirs !== undefined
        ? () => { edit(takeField(input, theirs, path)) }
        : null,
      problems: problems.filter((problem) => problem.path.startsWith(`${path}.`)),
    }
  }

  const content = input.content

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <TopBar
        locale={locale}
        researchId={view.researchId}
        humLabel={view.humLabel}
        dirty={dirty}
        saving={fetcher.state !== "idle"}
        saved={saved}
        onSave={save}
      />

      {conflict !== null && (
        <ConflictBand locale={locale} changed={conflict.changed} />
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

function TopBar({ locale, researchId, humLabel, dirty, saving, saved, onSave }: {
  locale: Locale
  researchId: string
  humLabel: string | null
  dirty: boolean
  saving: boolean
  saved: boolean
  onSave: () => void
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="sticky top-0 z-10 mb-4 border-line border-b bg-white py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-bold text-lg">{humLabel ?? t.heading}</h1>
          <Link to={href(locale, adminResearchPath(researchId))} className="text-sm">
            {t.backToResearch}
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {dirty && <span className="text-accent">{t.unsaved}</span>}
          {!dirty && saved && <span className="text-ink-muted">{t.saved}</span>}
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
      <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SECTIONS.map((section) => (
          <a key={section} href={`#${section}`}>{t.sections[section]}</a>
        ))}
      </nav>
    </div>
  )
}

function ConflictBand({ locale, changed }: { locale: Locale, changed: string[] }) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="mb-4 rounded-sm border border-accent bg-surface px-4 py-3 text-sm">
      <p className="font-semibold">{t.conflictHeading}</p>
      <p className="mt-1">
        {changed.length === 0 ? t.conflictNone : t.conflictBody(changed.length)}
      </p>
      {changed.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {changed.map((path) => (
            <li key={path} className="rounded-sm border border-line px-2 py-0.5 text-xs">
              <a href={`#${path.split(".")[0] ?? path}`}>{path}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProblemBand({ locale, problems }: { locale: Locale, problems: FieldProblem[] }) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="mb-4 rounded-sm border border-danger bg-surface px-4 py-3 text-sm">
      <p className="font-semibold text-danger">{t.problemsHeading}</p>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {problems.map((problem, at) => (
          <li key={at}>
            {problem.path}
            {" — "}
            {t.syntax[problem.syntax]}
            {" ("}
            {t.problemLine(problem.line)}
            )
          </li>
        ))}
      </ul>
    </div>
  )
}

function Section({ id, title, children }: { id: string, title: string, children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-32">
      <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">{title}</h2>
      {children}
    </section>
  )
}

function FieldHead({ label, marks, locale, untranslated = false }: {
  label: string
  marks: Marks
  locale: Locale
  untranslated?: boolean
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-ink-muted text-xs">{label}</span>
      {untranslated && (
        <span className="rounded-sm border border-line px-1.5 py-0.5 text-ink-muted text-xs">
          {t.untranslated}
        </span>
      )}
      {marks.changed && (
        <span className="rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
          {t.changed}
        </span>
      )}
      {marks.onTake !== null && (
        <button type="button" onClick={marks.onTake} className="cursor-pointer text-accent text-xs underline">
          {t.take}
        </button>
      )}
    </div>
  )
}

function StateSwitch({ state, onChange, locale }: {
  state: SlotState
  onChange: (next: SlotState) => void
  locale: Locale
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="flex gap-1">
      {STATES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={state === candidate}
          onClick={() => { onChange(candidate) }}
          className={`cursor-pointer rounded-sm border px-1.5 py-0.5 text-xs ${
            state === candidate ? "border-brand bg-brand text-white" : "border-line text-ink-muted"
          }`}
        >
          {t.states[candidate]}
        </button>
      ))}
    </div>
  )
}

/**
 * One language of one field. The text stays in the box whatever the state says,
 * so switching to "unsettled" and back gives the half-written value back.
 */
function SlotEditor({ language, value, multiline, onChange, locale, problems }: {
  language: Locale
  value: TextInput
  multiline?: boolean
  onChange: (next: TextInput) => void
  locale: Locale
  problems: FieldProblem[]
}) {
  const t = messagesFor(locale).admin.editor
  const disabled = value.state !== "value"
  const classes = `w-full rounded-sm border px-2 py-1 text-sm ${
    problems.length > 0 ? "border-danger" : "border-line"
  } ${disabled ? "bg-surface text-ink-muted" : ""}`

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-muted text-xs" lang={language}>{language}</span>
        <StateSwitch
          state={value.state}
          onChange={(state) => { onChange({ ...value, state }) }}
          locale={locale}
        />
      </div>
      {multiline === true
        ? (
            <textarea
              className={classes}
              rows={4}
              lang={language}
              disabled={disabled}
              value={value.text}
              onChange={(event) => { onChange({ ...value, text: event.target.value }) }}
            />
          )
        : (
            <input
              type="text"
              className={classes}
              lang={language}
              disabled={disabled}
              value={value.text}
              onChange={(event) => { onChange({ ...value, text: event.target.value }) }}
            />
          )}
      {problems.length > 0 && (
        <ul className="text-danger text-xs">
          {problems.map((problem, at) => (
            <li key={at}>{`${t.syntax[problem.syntax]} (${t.problemLine(problem.line)})`}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PairField({ label, value, multiline, marks, locale, onChange }: {
  label: string
  value: TextPairInput
  multiline?: boolean
  marks: Marks
  locale: Locale
  onChange: (next: TextPairInput) => void
}) {
  const problemsOf = (language: Locale) =>
    marks.problems.filter((problem) => problem.path.endsWith(`.${language}`))

  return (
    <div className="mt-4 first:mt-0">
      <FieldHead label={label} marks={marks} locale={locale} untranslated={isUntranslated(value)} />
      <div className="mt-1 grid gap-3 md:grid-cols-2">
        {(["ja", "en"] as const).map((language) => (
          <SlotEditor
            key={language}
            language={language}
            value={value[language]}
            multiline={multiline}
            locale={locale}
            problems={problemsOf(language)}
            onChange={(next) => { onChange({ ...value, [language]: next }) }}
          />
        ))}
      </div>
    </div>
  )
}

/** A field with one value and no languages: an identifier, an address, a DOI. */
function SingleField({ label, value, marks, locale, onChange }: {
  label: string
  value: TextInput
  marks: Marks
  locale: Locale
  onChange: (next: TextInput) => void
}) {
  return (
    <div className="mt-4">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="mt-1 md:max-w-md">
        <SlotEditor
          language={locale}
          value={value}
          locale={locale}
          problems={[]}
          onChange={onChange}
        />
      </div>
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

function RowButton({ label, onClick, disabled = false }: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-sm border border-line px-2 py-0.5 text-ink-muted text-xs disabled:opacity-50"
    >
      {label}
    </button>
  )
}

function ElementCard({ index, count, locale, onMove, onRemove, children }: {
  index: number
  count: number
  locale: Locale
  onMove: (by: number) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <div className="mt-4 rounded-sm border border-line px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-ink-muted text-xs">{index + 1}</span>
        <div className="flex gap-1">
          <RowButton label={t.moveUp} disabled={index === 0} onClick={() => { onMove(-1) }} />
          <RowButton
            label={t.moveDown}
            disabled={index === count - 1}
            onClick={() => { onMove(1) }}
          />
          <RowButton label={t.remove} onClick={onRemove} />
        </div>
      </div>
      {children}
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
          onChange([...items, { id: newId(), name: emptyPair(), url: emptyLinks() }])
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

function AddElement({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-sm"
      >
        {label}
      </button>
    </div>
  )
}

function datasetName(row: ResearchDatasetRow, locale: Locale): string {
  return row.label ?? messagesFor(locale).admin.editor.unpinnedDataset
}

/** The datasets a version lists, in the order it lists them. */
function DatasetOrder({ locale, datasets, selected, onChange }: {
  locale: Locale
  datasets: ResearchDatasetRow[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const t = messagesFor(locale).admin.editor
  const byId = new Map(datasets.map((row) => [row.id, row]))
  const unselected = datasets.filter((row) => !selected.includes(row.id))

  if (datasets.length === 0) return <p className="text-ink-muted text-sm">{t.noDatasets}</p>

  return (
    <div className="mt-2 flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {selected.map((id, at) => {
          const row = byId.get(id)
          return (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="min-w-40">{row === undefined ? id : datasetName(row, locale)}</span>
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
