/**
 * The screen one dataset of a draft is written on.
 *
 * The unit is the dataset because that is the unit of everything else about it:
 * its own identity, its own entry in the draft, its own revision to be checked
 * against. A research with two hundred datasets is not one screenful, and a
 * conflict over one of them is not a conflict over the rest.
 *
 * **Experiments are here rather than on a screen of their own.** They live
 * inside this dataset's content, so they are saved with it and checked against
 * the same revision.
 *
 * A value is shown under the catalog key it is stored against, and **only the
 * keys it actually has**. A slot that is not there is not an empty value: it is
 * the dataset not having that item at all, which is a different thing from
 * having it and leaving it blank. Adding one is choosing a key.
 *
 * **The three parts are tabs, and each experiment collapses inside its own.** The
 * experiment scope of the catalog runs to some ninety keys, so one experiment
 * with a fair share of them is a couple of thousand pixels of boxes and a
 * handful of them is a page nothing can be found on. Only the display is
 * switched: every field stays in the document, one save sends the whole of
 * it, and an indicator beside a field is addressed by path and so is unaffected by
 * which tab it is under. **The tab is not in the address** — nothing here saves
 * on its own, so a reload would cost what has been typed whatever tab it
 * restored.
 *
 * **What is marked is open.** An experiment a save refused, a publish moved or
 * the server rejected markup in is expanded, and so is one with no display
 * label — a collapsible nobody can read the summary of is a listing that lies about
 * itself.
 */

import { useEffect, useId, useRef, useState } from "react"
import { useFetcher } from "react-router"

import { describeAt } from "~/admin/changes"
import { diffDatasetInput, importDatasetField } from "~/admin/dataset-diff"
import {
  emptyDiseaseRow,
  emptyNumberRow,
  emptyValueInput,
  highBelowValue,
  labelCandidatesFor,
  UneditableValueKind,
  type DatasetContentInput,
  type DiseaseRow,
  type ExperimentInput,
  type NumberRow,
  type ValueInput,
  type ValueKind,
} from "~/admin/dataset-form"
import type { SlotState } from "~/admin/form"
import { isNhaId } from "~/admin/labels"
import type { DatasetEditorView, DatasetLabelResult } from "~/admin/pages.server"
import type { EditableCatalog, EditableKey, EditableTerm } from "~/admin/queries.server"
import {
  adminDraftDatasetsPath,
  adminExperimentFieldPath,
  adminExperimentFieldsPath,
  adminResearchFilesPath,
  datasetPagePath,
  draftCommentsPath,
  termsPath,
} from "~/admin/urls"
import {
  Badge,
  Button,
  ButtonLink,
  Confirm,
  CollapsibleChevron,
  collapsibleOpen,
  IconButton,
  MENU_PANEL,
  PANE_LABEL,
  PaneHeading,
  ReorderButtons,
  Stack,
  ValueChip,
} from "~/components/base"
import { Answer, CONTROL, Select } from "~/components/form"
import { Icon } from "~/components/icons"
import { AnnotationLayer, Card, Empty, Page, PageHeader } from "~/components/page"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, researchPath } from "~/public/urls"
import { commentsByPath } from "~/review/comments"
import type { DrawnDataset } from "~/review/preview.server"

import { usePanes } from "./admin"
import { DraftHead, DraftTools, useDraftEditing, useDrawn, type DraftEditing } from "./draft-tools"
import { OpenComments } from "./comments"
import { IdForm } from "./dataset-id"
import { FieldReview, type FieldReviewData } from "./field-review"
import { DatasetBody } from "./dataset"
import { FileSelection } from "./file-selection"
import {
  AddElement,
  ConflictBanner,
  FieldFlags,
  FieldHead,
  isUntranslated,
  PairField,
  Section,
  SingleField,
  StateSwitch,
  emptySlot,
  moved,
  newId,
  replacing,
  type FieldAnnotations,
} from "./fields"
import { focusField, focusElement } from "./form"
import { Flag } from "./flags"

/**
 * How many candidates the term picker offers at once. A vocabulary can hold
 * thousands, and a list longer than this is not read — it is typed at again.
 */
const PICKER_RESULTS = 20

/** How long the keys have to be still before the vocabulary is asked. */
const SEARCH_PAUSE_MS = 200

const BASICS = "basics"
const FILES = "files"
const EXPERIMENTS = "experiments"

/**
 * The section a field is written in, by the head of its path — which is also
 * the id that section has, so one lookup finds both.
 */
const SECTION_OF: Record<string, string> = {
  releaseDate: BASICS,
  values: BASICS,
  fileSelection: FILES,
  experiments: EXPERIMENTS,
}

export function DatasetEditor({ view }: { view: DatasetEditorView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.datasetEditor
  const editor = messagesFor(locale).admin.editor
  const { researchId, draftId } = view

  const subject = { kind: "dataset" as const, datasetId: view.datasetId }
  const termLabelOf = new Map(view.terms.map((term) => [term.id, catalogLabel(term, locale)]))
  const keyLabelOf = new Map(view.catalog.keys.map((key) => [key.id, catalogLabel(key, locale)]))

  /**
   * The field's own name for the comment panel's heading: the catalog's own
   * label for a value slot, the section's name otherwise. Read off the path a
   * indicator is addressed by, the same one the field itself is written at
   * (`fields.tsx` の `FieldAnnotations`).
   */
  /**
   * A field of this dataset as the open-comments panel names it: the field's
   * label, and for a field of an experiment, the experiment's label before it.
   */
  function pathName(path: string): string {
    const label = fieldLabelFor(path) ?? path
    const [head, id] = path.split(".")
    if (head !== "experiments" || id === undefined) return label
    const experiment = view.input.experiments.find((one) => one.id === id)
    const name = experiment === undefined || experiment.label.text === "" ? t.unnamedExperiment : experiment.label.text
    return `${name} — ${label}`
  }

  function fieldLabelFor(path: string): string | undefined {
    const [head, ...rest] = path.split(".")
    if (head === "releaseDate") return t.releaseDate
    if (head === "fileSelection") return t.files
    if (head === "values") return rest[0] === undefined ? t.values : keyLabelOf.get(rest[0]) ?? t.values
    if (head === "experiments") {
      if (rest[1] === "label") return t.experimentLabel
      if (rest[1] === "values") return rest[2] === undefined ? t.values : keyLabelOf.get(rest[2]) ?? t.values
      return t.experiments
    }
    return undefined
  }

  // Declared above the editing state rather than below it: what a field hangs
  // beside itself is passed to the hook as a value at the call.
  const review: FieldReviewData = {
    context: {
      locale,
      action: draftCommentsPath(researchId, draftId),
      subject,
      canResolve: true,
      signedInName: view.review.signedInName,
    },
    comments: commentsByPath(view.review.comments, subject),
    changed: view.review.changed,
    previous: view.review.previous,
    // Read when an indicator opens, by which time the editing state below exists.
    current: (at) => describeAt(editing.value, at),
    heading: messagesFor(locale).preview.previousPublished,
    termLabel: (id) => termLabelOf.get(id) ?? id,
  }

  const editing = useDraftEditing<DatasetContentInput>({
    initial: view.input,
    revision: view.revision,
    diff: diffDatasetInput,
    importAt: importDatasetField,
    body: (value) => ({ content: value }),
  })

  /**
   * The pane catching up with what is being typed, and where the caret is.
   *
   * The research editor works the same way and for the same reasons
   * (`editor.tsx`): a pause rather than a keystroke, and a place rather than a
   * box — the ja and en sides of one value are one place.
   */
  const drawBody = JSON.stringify({ revision: view.revision, content: editing.value })
  const pageJa = useDrawn<DrawnDataset>(
    datasetPagePath(researchId, draftId, view.datasetId, "ja"),
    drawBody,
    locale === "ja" ? view.page : null,
  )
  const pageEn = useDrawn<DrawnDataset>(
    datasetPagePath(researchId, draftId, view.datasetId, "en"),
    drawBody,
    locale === "en" ? view.page : null,
  )

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
   * the field when it is open, the nearest element that is, else the section.
   */
  function goTo(path: string): void {
    focusField(form.current, path, SECTION_OF[path.split(".")[0] ?? path])
  }

  /** The same move, for a banner that draws its own anchors. */
  function onHeaderBarJump(event: React.MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const path = target.closest("a[href^='#']")?.getAttribute("href")?.slice(1)
    if (path === undefined) return
    event.preventDefault()
    goTo(path)
  }

  const input = editing.value
  // The copy just made, which opens so the curator starts on what differs.
  const [copied, setCopied] = useState<string | null>(null)
  const marked = conflictedPaths(editing)
  const conflictedUnder = (prefix: string) =>
    marked.filter((path) => path === prefix || path.startsWith(`${prefix}.`)).length

  /** What is worth knowing about an experiment while it is collapsed away. */
  function experimentNote(experiment: ExperimentInput): string {
    const count = t.valueCount(experiment.values.length)
    return conflictedUnder(`experiments.${experiment.id}`) > 0 ? `${count} · ${editor.changedElsewhere}` : count
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

          {/* **No section named for what it holds in general** (「基本情報」): each
              of the dataset's values is a section headed by its own name, the
              way the research's fields are. The wrapper is only what a focus jump
              falls back to. */}
          <div id={BASICS} className="scroll-mt-32">
            <Stack gap="block">
              <Values
                headed
                locale={locale}
                catalog={view.catalog}
                terms={view.terms}
                scope="dataset"
                path="values"
                leading={[view.page.typeOfDataAnchor, view.page.accessAnchor]
                  .flatMap((anchor) => anchor?.split(".")[1] ?? [])}
                values={input.values}
                annotationsFor={editing.annotationsFor}
                onChange={(values) => { editing.edit({ ...input, values }) }}
              />
            </Stack>
          </div>

          {view.portalIssued && (
            <Section
              id={FILES}
              title={t.files}
              flags={<FieldFlags annotations={editing.annotationsFor("fileSelection")} locale={locale} />}
            >
              <FileSelection
                locale={locale}
                listing={view.listing}
                selected={input.fileSelection}
                filesAt={href(locale, adminResearchFilesPath(researchId))}
                onChange={(fileSelection) => { editing.edit({ ...input, fileSelection }) }}
              />
            </Section>
          )}

          <Section
            id={EXPERIMENTS}
            title={t.experiments}
            flags={<FieldFlags annotations={editing.annotationsFor("experiments")} locale={locale} />}
          >
            {input.experiments.map((experiment, at) => (
              <ExperimentCard
                key={experiment.id}
                locale={locale}
                index={at}
                count={input.experiments.length}
                summary={experiment.label.text === ""
                  ? <span className="text-ink-muted">{t.unnamedExperiment}</span>
                  : experiment.label.text}
                note={experimentNote(experiment)}
                open={experiment.label.text === ""
                  || experiment.id === copied
                  || conflictedUnder(`experiments.${experiment.id}`) > 0}
                onMove={(by) => {
                  editing.edit({ ...input, experiments: moved(input.experiments, at, by) })
                }}
                onCopy={() => {
                  const copy = copiedExperiment(experiment)
                  setCopied(copy.id)
                  editing.edit({
                    ...input,
                    experiments: [...input.experiments.slice(0, at + 1), copy, ...input.experiments.slice(at + 1)],
                  })
                }}
                onRemove={() => {
                  editing.edit({
                    ...input,
                    experiments: input.experiments.filter((row) => row.id !== experiment.id),
                  })
                }}
              >
                <Experiment
                  locale={locale}
                  catalog={view.catalog}
                  terms={view.terms}
                  experiment={experiment}
                  annotationsFor={editing.annotationsFor}
                  onChange={(next) => {
                    editing.edit({
                      ...input,
                      experiments: replacing(input.experiments, experiment.id, next),
                    })
                  }}
                />
              </ExperimentCard>
            ))}
            <AddElement
              label={t.addExperiment}
              onClick={() => {
                editing.edit({
                  ...input,
                  experiments: [
                    ...input.experiments,
                    { id: newId(), label: emptySlot(), values: [] },
                  ],
                })
              }}
            />
          </Section>
        </Stack>
      </Card>
    </div>
  )
  const panes = usePanes({
    locale,
    under: "bar",
    contents: [
      { id: "form", label: editor.paneForm, body: formBody },
      ...([["page", editor.panePageJa, "ja", pageJa], ["page-en", editor.panePageEn, "en", pageEn]] as const).map(
        ([id, label, language, drawn]) => ({
          id,
          label,
          body: (
            <AnnotationLayer
              /*
                The difference from what is published and the comments belong
                to the place a reader looks at; what a save refused and what
                somebody else moved belong to the hands typing, and stay in
                the form. Where the caret is, the page shows on the value itself
                (`page.tsx` の `ValueAtPath`).
              */
              annotate={(anchor) => <FieldReview review={review} at={anchor} fieldLabel={fieldLabelFor(anchor)} />}
              here={at}
              onGo={goTo}
              goLabel={editor.goToField}
            >
              <PageHeader
                level="p"
                kicker={messagesFor(locale).dataset.datasetId}
                label={(
                  <>
                    <Icon name="database" aria-hidden="true" />
                    {view.datasetLabel ?? editor.unpinnedDataset}
                  </>
                )}
              >
                <Badge onHeaderBar icon={<Icon name="edit" aria-hidden="true" />}>
                  {view.updating === null ? editor.draftBadge : editor.updatingBadge(`v${view.updating}`)}
                </Badge>
              </PageHeader>
              <Card>
                {/* **Nothing is drawn until this language has been drawn.** The
                  other language's page would be the wrong words under the right
                  tab, and the first drawing arrives a keystroke's pause later. */}
                {drawn !== null && (
                  <DatasetBody
                    view={drawn.view}
                    locale={language}
                    // The way a reader goes back to the research. The label may not
                    // be pinned yet, in which case the page it identifies does not exist
                    // — the same as it is under a share link.
                    researchHref={href(language, researchPath(drawn.humLabel ?? ""))}
                    accessAnchor={drawn.accessAnchor}
                    typeOfDataAnchor={drawn.typeOfDataAnchor}
                  />
                )}
              </Card>
            </AnnotationLayer>
          ),
        })),
    ],
  })

  return (
    <Page>
      <Stack>
        {/* The back link leads to the list this dataset is in. A dataset is a part of
            the draft rather than a screen of its own, so the header has no
            second line. */}
        <DraftHead
          locale={locale}
          title={t.heading}
          aside={view.datasetLabel ?? editor.unpinnedDataset}
          updating={view.updating}
          badge={!view.published && <Flag kind="hidden">{messagesFor(locale).admin.detail.unpublishedDataset}</Flag>}
          back={{
            to: href(locale, adminDraftDatasetsPath(researchId, draftId)),
            label: t.backToList,
            icon: "chevron-left",
          }}
          // **What identifies the dataset and dates it is shown in the header**,
          // not in the form: the id is pinned apart from the save, and the
          // dates of an archive's accession are read from the archive rather
          // than written here.
          overview={(
            <DatasetFacts view={view} locale={locale} />
          )}
          tools={(
            <DraftTools
              locale={locale}
              panesControl={panes.control}
              // **The open questions about this dataset, in the panel the
              // research's own form opens** — cut by field, since the dataset
              // is the whole of what is written here. The memo and the whole
              // belong to the draft, and are the research's form to open.
              notes={(
                <OpenComments
                  context={review.context}
                  comments={view.review.comments.filter((one) =>
                    one.anchor.kind === "dataset-field" && one.anchor.datasetId === view.datasetId)}
                  nameOf={(anchor) => anchor.kind === "dataset-field" ? pathName(anchor.path) : editor.whole}
                  perField
                />
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
 * Every path a refused save left an indicator at. A tab and a collapsible both hide what is
 * inside them, so both have to be able to show that something in there wants
 * looking at.
 */
function conflictedPaths(editing: DraftEditing<DatasetContentInput>): string[] {
  return editing.conflict?.changed ?? []
}

function Experiment({ locale, catalog, terms, experiment, annotationsFor, onChange }: {
  locale: Locale
  catalog: EditableCatalog
  terms: EditableTerm[]
  experiment: ExperimentInput
  annotationsFor: (path: string) => FieldAnnotations
  onChange: (next: ExperimentInput) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const path = `experiments.${experiment.id}`

  // **Three parts, each under its own heading** — the experiment itself, the
  // items it has, and the way to add one. Twenty-odd fields run together
  // under the card's line read as one list, and the box to add a field was
  // found only by scrolling past all of them.
  return (
    <Stack gap="block">
      <Stack>
        {/* **The heading is the field's name**: under 「解析手法」 the one box is
            what the experiment is called, and a second name over it only shows
            so again. Its indicators stand on the heading's line. */}
        <PaneHeading title={t.experiments} level="h3" rule="start">
          <span className="flex items-center gap-2">
            <FieldFlags annotations={annotationsFor(`${path}.label`)} locale={locale} />
          </span>
        </PaneHeading>
        <SingleField
          value={experiment.label}
          annotations={annotationsFor(`${path}.label`)}
          locale={locale}
          onChange={(label) => { onChange({ ...experiment, label }) }}
        />
      </Stack>
      <Values
        locale={locale}
        catalog={catalog}
        terms={terms}
        scope="experiment"
        path={`${path}.values`}
        values={experiment.values}
        annotationsFor={annotationsFor}
        headings={{ values: t.values, add: t.addValue }}
        onChange={(values) => { onChange({ ...experiment, values }) }}
      />
    </Stack>
  )
}

/**
 * The values a dataset or an experiment has, in catalog order, and the way
 * to add one it does not have yet.
 *
 * **A key cannot be invented here.** Adding one is choosing from the catalog,
 * which is what keeps the set of keys a decision somebody made rather than a
 * side effect of typing — the way the previous portal's catalog drifted.
 */
function Values({ locale, catalog, terms, scope, path, values, annotationsFor, onChange, leading = [], headed = false, headings }: {
  locale: Locale
  catalog: EditableCatalog
  /**
   * The keys the page draws in places of its own, in the page's order — the
   * type of data, then the access type. **The form runs in the page's order**,
   * so these come first and the rest follow in catalog order. **They are always
   * there**: every dataset page draws them, so the form offers neither adding
   * nor removing them — an empty one is a field waiting to be filled.
   */
  leading?: readonly string[]
  /**
   * Each value is a section of its own, headed by its name (`fields.tsx` の
   * `Section`) — the dataset's own values, which are shown at the top of the form
   * the way the research's fields do. An experiment's values stay named rows
   * inside its card.
   */
  headed?: boolean
  /**
   * Headings for the items and for the way to add one, inside an experiment's
   * card (`Experiment`) — the parts are shown apart rather than run together.
   */
  headings?: { values: string, add: string }
  /** The terms the document names, for the chosen values to be readable. */
  terms: EditableTerm[]
  scope: "dataset" | "experiment"
  path: string
  values: ValueInput[]
  annotationsFor: (path: string) => FieldAnnotations
  onChange: (next: ValueInput[]) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const keys = catalog.keys.filter((key) => key.scope === scope)
  const keyById = new Map(keys.map((key) => [key.id, key]))
  const positionOf = (value: ValueInput) => {
    const lead = leading.indexOf(value.keyId)
    return lead === -1 ? leading.length + (keyById.get(value.keyId)?.position ?? 0) : lead
  }
  const held = new Set(values.map((value) => value.keyId))
  const always = leading.flatMap((id) => {
    const key = keyById.get(id)
    return key === undefined || held.has(id) || !isEditable(key)
      ? []
      : [emptyValueInput(key.id, editableKind(key), key.canonicalUnit)]
  })
  const inOrder = [...values, ...always].sort((a, b) => positionOf(a) - positionOf(b))
  const spare = keys.filter((key) => !held.has(key.id) && !leading.includes(key.id) && isEditable(key))

  // The field just added, which takes the caret once it is drawn.
  const around = useRef<HTMLDivElement>(null)
  const added = useRef<string | null>(null)
  useEffect(() => {
    if (added.current === null) return
    const field = around.current?.querySelector<HTMLElement>(`[data-at="${CSS.escape(`${path}.${added.current}`)}"]`)
    added.current = null
    if (field != null) focusElement(field, "center")
  })

  // An always-there field the document does not have yet joins it once written.
  const replace = (keyId: string, next: ValueInput) => {
    onChange(held.has(keyId) ? values.map((value) => value.keyId === keyId ? next : value) : [...values, next])
  }

  const adding = spare.length > 0 && (
    <AddValue
      locale={locale}
      keys={spare}
      catalogLink={scope === "experiment" && (
        <ButtonLink
          to={href(locale, adminExperimentFieldsPath())}
          external
          newTab
          newTabLabel={messagesFor(locale).newTab}
          size="row"
        >
          {messagesFor(locale).admin.catalog.heading}
        </ButtonLink>
      )}
      onAdd={(key) => {
        onChange([...values, emptyValueInput(key.id, editableKind(key), key.canonicalUnit)])
        added.current = key.id
      }}
    />
  )

  const fields = (
    <>
      {inOrder.map((value) => {
        const key = keyById.get(value.keyId)
        if (key === undefined) return null
        const at = `${path}.${value.keyId}`
        // **At the field name's own row, the same place every other row's
        // delete sits** — not a control of its own set apart from the field
        // it acts on.
        const remove = leading.includes(value.keyId)
          ? undefined
          : {
              label: t.removeValue,
              onClick: () => { onChange(values.filter((row) => row.keyId !== value.keyId)) },
            }
        if (headed) {
          const body = value.value
          return (
            <Section
              key={value.keyId}
              id={`value-${value.keyId}`}
              title={catalogLabel(key, locale)}
              accepts={body.kind === "text" ? messagesFor(locale).admin.accepts.prose : undefined}
              flags={(
                <FieldFlags
                  annotations={annotationsFor(at)}
                  locale={locale}
                  untranslated={body.kind === "text" && isUntranslated(body.text)}
                />
              )}
              remove={remove}
            >
              <ValueEditor
                label={catalogLabel(key, locale)}
                named={false}
                locale={locale}
                catalogKey={key}
                terms={terms}
                value={value}
                annotations={annotationsFor(at)}
                onChange={(next) => { replace(value.keyId, next) }}
              />
            </Section>
          )
        }
        return (
          <div key={value.keyId}>
            <ValueEditor
              label={catalogLabel(key, locale)}
              locale={locale}
              catalogKey={key}
              terms={terms}
              value={value}
              annotations={annotationsFor(at)}
              remove={remove}
              onChange={(next) => { replace(value.keyId, next) }}
            />
          </div>
        )
      })}
    </>
  )

  if (headings === undefined) {
    return (
      <div ref={around}>
        <Stack>
          {fields}
          {adding}
        </Stack>
      </div>
    )
  }
  return (
    <div ref={around}>
      <Stack gap="block">
        <Stack>
          <PaneHeading title={headings.values} level="h3" rule="start" />
          {inOrder.length === 0 ? <Empty>{t.noValue}</Empty> : fields}
        </Stack>
        {adding !== false && (
          <Stack>
            <PaneHeading title={headings.add} level="h3" rule="start" />
            {adding}
          </Stack>
        )}
      </Stack>
    </div>
  )
}

/**
 * One value under a catalog key, with the control its kind is written with.
 * **Written once**, so the dataset's own form and the import form write a
 * value the same way.
 */
export function ValueEditor({ label, named = true, locale, catalogKey: key, terms, value, annotations, remove, onChange }: {
  label: string
  /**
   * Whether the field draws its own name row. **Not when a heading names it**
   * (`Values` の `headed`): the name would be read twice, and the name row's
   * indicators are shown on the heading instead. The label still identifies the boxes for
   * anyone not looking at them.
   */
  named?: boolean
  locale: Locale
  catalogKey: EditableKey
  terms: EditableTerm[]
  value: ValueInput
  annotations: FieldAnnotations
  remove?: { label: string, onClick: () => void }
  onChange: (next: ValueInput) => void
}) {
  const body = value.value
  const link = <ChoicesLink catalogKey={key} locale={locale} />
  return (
    <>
      {body.kind === "text" && (
        <PairField
          label={named ? label : undefined}
          value={body.text}
          multiline
          annotations={annotations}
          locale={locale}
          remove={remove}
          onChange={(text) => { onChange({ keyId: value.keyId, value: { kind: "text", text } }) }}
        />
      )}
      {body.kind === "vocabulary" && (
        <VocabularyField
          label={label}
          named={named}
          link={link}
          locale={locale}
          annotations={annotations}
          setId={key.vocabularySetId}
          known={terms}
          multiple={key.multiple}
          state={body.state}
          termIds={body.termIds}
          remove={remove}
          onChange={(state, termIds) => {
            onChange({ keyId: value.keyId, value: { kind: "vocabulary", state, termIds } })
          }}
        />
      )}
      {body.kind === "number" && (
        <NumberField
          label={label}
          named={named}
          locale={locale}
          annotations={annotations}
          units={key.inputUnits ?? []}
          labelCandidates={labelCandidatesFor(key.code)}
          state={body.state}
          rows={body.rows}
          remove={remove}
          onChange={(next) => { onChange({ keyId: value.keyId, value: { kind: "number", ...next } }) }}
        />
      )}
      {body.kind === "disease" && (
        <DiseaseField
          label={label}
          named={named}
          link={link}
          locale={locale}
          annotations={annotations}
          setId={key.vocabularySetId}
          known={terms}
          state={body.state}
          diseases={body.diseases}
          remove={remove}
          onChange={(next) => { onChange({ keyId: value.keyId, value: { kind: "disease", ...next } }) }}
        />
      )}
    </>
  )
}

/**
 * The link to the screen that keeps what a field chooses from (「選べる値」),
 * **opened in a new tab** — the form around it may hold unsaved work, and a
 * value found missing there is added and then chosen here.
 *
 * **Only for the keys that have that screen**: the vocabularies of an
 * experiment. A dataset's own access type is a closed list the portal defines,
 * with no screen to keep it on.
 */
export function ChoicesLink({ catalogKey: key, locale }: { catalogKey: EditableKey, locale: Locale }) {
  if (key.scope !== "experiment" || (key.valueType !== "vocabulary" && key.valueType !== "disease")) return null
  const messages = messagesFor(locale)
  return (
    <ButtonLink
      to={href(locale, adminExperimentFieldPath(key.code))}
      external
      newTab
      newTabLabel={messages.newTab}
      size="row"
    >
      {messages.admin.datasetEditor.choices}
    </ButtonLink>
  )
}

/** The key types this screen has an input control for. */
const EDITABLE: readonly ValueKind[] = ["text", "vocabulary", "number", "disease"]

/**
 * Whether the editor has an input control for a key, and which. Only the four
 * kinds the catalog uses are editable; a key of any other type arrives with the
 * layer that gives it a control, because **a value nobody can see is a value
 * nobody can keep**.
 *
 * The refusal cannot be reached — only keys `isEditable` lets through get here
 * — and it throws rather than falling back so that a further kind gaining a
 * control is a change in one place rather than a slot quietly rendered as prose.
 */
function editableKind(key: EditableKey): ValueKind {
  const kind = EDITABLE.find((one) => one === key.valueType)
  if (kind === undefined) throw new UneditableValueKind(key.id, key.valueType)
  return kind
}

function isEditable(key: EditableKey): boolean {
  return EDITABLE.some((kind) => kind === key.valueType)
}

/**
 * The way to add an item the dataset or the experiment does not have: **a
 * box that opens its list as it is entered**, the same combobox a vocabulary is
 * chosen with (`ComboBox`), filtered by what the key is called. A collapsible labelled
 * 「項目の追加」 read as a heading, and what it held was found by opening it.
 * Choosing adds the field and takes the caret to it.
 *
 * **The shape does not follow the number of keys on offer.** A dataset down to
 * a couple of spare items and an experiment down to most of ninety draw the
 * same control, so the catalog does not change the screen's shape on the day a
 * key is added to it — the same reason `VocabularyField` and `FileSelection`
 * draw this shape regardless of how many candidates they hold.
 *
 * **The filtering happens here rather than on the server.** Unlike a
 * vocabulary's terms, the keys on offer already came down with the document —
 * a dataset or an experiment only ever has as many catalog keys as the scope
 * defines, not a set that grows the way a vocabulary does.
 *
 * **Nothing is chosen and then confirmed** — a second press to commit a choice
 * already made is a step that only exists because the first control could not
 * act.
 */
function AddValue({ locale, keys, catalogLink, onAdd }: {
  locale: Locale
  keys: EditableKey[]
  /** A link to the screen where the keys themselves are kept, when there is one. */
  catalogLink?: React.ReactNode
  onAdd: (key: EditableKey) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const [find, setFind] = useState("")
  const [chosen, setChosen] = useState<EditableKey | null>(null)
  // Drawn afresh after each addition, so the box starts empty again.
  const [round, setRound] = useState(0)
  const needle = find.trim().toLowerCase()
  const offered = keys.filter((key) => catalogLabel(key, locale).toLowerCase().includes(needle))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 md:max-w-md">
        <ComboBox
          key={round}
          label={t.addValue}
          placeholder={t.addValuePlaceholder}
          options={offered}
          keyOf={(key) => key.id}
          render={(key) => <span>{catalogLabel(key, locale)}</span>}
          empty={t.noKey}
          words={{ searching: t.searching, count: t.candidateCount }}
          onQuery={(value, typed) => {
            setFind(value)
            if (typed) setChosen(null)
          }}
          onChoose={(key) => {
            setChosen(key)
            setFind("")
          }}
          kept={(key) => catalogLabel(key, locale)}
        />
      </div>
      {/* **Choosing is not adding.** A whole field lands in the form at the
          press, so the choice waits in the box until it is confirmed — unlike
          a term, which is one chip and taken back with one press. */}
      <Button
        type="button"
        size="xs"
        icon={<Icon name="plus" />}
        disabled={chosen === null ? t.chooseKeyFirst : undefined}
        onClick={() => {
          if (chosen === null) return
          onAdd(chosen)
          setChosen(null)
          setFind("")
          setRound((at) => at + 1)
        }}
      >
        {t.add}
      </Button>
      {catalogLink}
    </div>
  )
}

/**
 * The numbers under one key.
 *
 * The unit offered is the catalog's list, and the value is converted to the
 * key's own unit on the way in (`app/content/units.ts`) — what is kept here is
 * what the author wrote. **An empty field means the slot is not saved**: there is
 * no "empty number" the way there is an empty piece of prose, so leaving it
 * blank is the same as not having added the value at all.
 *
 * **A row each, because a key holds a list** (`app/content/types.ts`). What a
 * v1 curator wrote as one cell — `常染色体: 5,961,600 SNVs` above
 * `X染色体: 147,353 SNVs` — is two facts, and typing them as two rows is what
 * makes them countable and filterable instead of prose.
 *
 * **The label and the note only appear once they are in use.** Most keys have
 * a single bare number, and four boxes where one is wanted is a form that requests
 * more than the value does. They come out when there is a second row (which is
 * when "which number is this" starts to have an answer) or when the row already
 * has one.
 *
 * **The unit is a `Select` the screen holds.** A key offers a few units and
 * that is what a select is for; everything on this screen is in React state, so
 * it is the controlled form and sends nothing of its own.
 *
 * **A row's upper end shares the lower end's unit and box.** Typed after the
 * separator, it is what makes the row a width (`0.9〜1.3 GB`) rather than a bare
 * number — a second unit for the same row would show the two ends could be
 * measured differently, which they cannot. A typed upper end below the lower
 * end is a shape the save path refuses outright
 * (`app/admin/dataset-form.server.ts`), so the box marks itself wrong the
 * moment it is typed rather than waiting for that refusal.
 */
function NumberField({ label, named: drawsName = true, locale, annotations, units, labelCandidates, state, rows, remove, onChange }: {
  label: string
  /** Whether it draws its own name row (`ValueEditor` の `named`). */
  named?: boolean
  locale: Locale
  annotations: FieldAnnotations
  units: string[]
  /** Free-text suggestions for the label box, not a closed set (`app/admin/dataset-form.ts`). */
  labelCandidates: readonly string[]
  state: SlotState
  rows: NumberRow[]
  remove?: { label: string, onClick: () => void }
  onChange: (next: { state: SlotState, rows: NumberRow[] }) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const disabled = state !== "value"
  const named = rows.length > 1 || rows.some((row) => row.label !== "" || row.note !== "")
  const box = `${CONTROL} text-sm disabled:opacity-50`
  const labelListId = useId()
  const edit = (at: number, next: Partial<NumberRow>) => {
    onChange({ state, rows: rows.map((row, i) => (i === at ? { ...row, ...next } : row)) })
  }

  return (
    <Stack gap="tight" at={annotations.at}>
      <FieldHead label={drawsName ? label : undefined} annotations={annotations} locale={locale} remove={remove} />
      {/* **The state toggles are shown at the right of the values**, level with the
          first row — where every other field puts them — rather than on a row
          of their own above the values. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 md:max-w-xl">
          <Stack gap="tight">
            {labelCandidates.length > 0 && (
              <datalist id={labelListId}>
                {labelCandidates.map((candidate) => <option key={candidate} value={candidate} />)}
              </datalist>
            )}
            {rows.map((row, at) => {
              const highInvalid = highBelowValue(row)
              const highErrorId = `${labelListId}-high-${at}`
              // Rendered as a spread rather than `aria-invalid={false}` — React
              // writes an `aria-*` prop out whichever way it is set, and a valid
              // row has nothing to describe (`fields.tsx` の `SlotEditor` の `described`).
              const invalidDescribed = highInvalid
                ? { "aria-invalid": true, "aria-describedby": highErrorId }
                : {}
              return (
                <div key={at} className="flex flex-wrap items-center gap-2">
                  {named && (
                    <input
                      type="text"
                      value={row.label}
                      disabled={disabled}
                      aria-label={t.numberLabel}
                      placeholder={t.numberLabel}
                      list={labelCandidates.length > 0 ? labelListId : undefined}
                      onChange={(event) => { edit(at, { label: event.target.value }) }}
                      className={`${box} w-36`}
                    />
                  )}
                  <input
                    type="number"
                    step="any"
                    value={row.value}
                    disabled={disabled}
                    aria-label={label}
                    onChange={(event) => { edit(at, { value: event.target.value }) }}
                    className={`${box} w-40`}
                  />
                  <span aria-hidden="true" className="text-ink-muted text-sm">{t.numberRangeSeparator}</span>
                  <input
                    type="number"
                    step="any"
                    value={row.high}
                    disabled={disabled}
                    aria-label={`${label} ${t.numberHigh}`}
                    placeholder={t.numberHigh}
                    {...invalidDescribed}
                    onChange={(event) => { edit(at, { high: event.target.value }) }}
                    className={`${box} w-40 ${highInvalid ? "border-danger" : ""}`}
                  />
                  {highInvalid && (
                    <span id={highErrorId} className="flex items-center gap-1 text-danger text-xs">
                      <Icon name="alert" aria-hidden="true" />
                      {t.numberHighInvalid}
                    </span>
                  )}
                  {units.length > 1
                    ? (
                        <Select
                          label={t.unit}
                          hideLabel
                          value={row.unit ?? ""}
                          options={units.map((one) => ({ value: one, label: one }))}
                          disabled={disabled}
                          width="w-28"
                          onChange={(unit) => { edit(at, { unit }) }}
                        />
                      )
                    : row.unit !== null && <span className="text-ink-muted text-sm">{row.unit}</span>}
                  {named && (
                    <input
                      type="text"
                      value={row.note}
                      disabled={disabled}
                      aria-label={t.numberNote}
                      placeholder={t.numberNote}
                      onChange={(event) => { edit(at, { note: event.target.value }) }}
                      className={`${box} w-36`}
                    />
                  )}
                  {rows.length > 1 && (
                    <IconButton
                      name="trash"
                      label={t.removeNumber}
                      disabled={disabled}
                      onClick={() => { onChange({ state, rows: rows.filter((_, i) => i !== at) }) }}
                    />
                  )}
                </div>
              )
            })}
            {!disabled && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  icon={<Icon name="plus" />}
                  onClick={() => {
                    onChange({ state, rows: [...rows, emptyNumberRow(units[0] ?? null)] })
                  }}
                >
                  {t.addNumber}
                </Button>
              </div>
            )}
            {!disabled && rows.every((row) => row.value.trim() === "") && (
              <p className="text-ink-muted text-xs">{t.emptyNumber}</p>
            )}
          </Stack>
        </div>
        <span className="ml-auto flex h-9 shrink-0 items-center">
          <StateSwitch
            state={state}
            onChange={(next) => { onChange({ state: next, rows }) }}
            locale={locale}
          />
        </span>
      </div>
    </Stack>
  )
}

/**
 * A value chosen from a controlled vocabulary. The state sits beside the choice
 * the same way it does beside text: a term that has not been settled is a
 * question, not an absent value.
 */
function VocabularyField({
  label,
  named = true,
  link,
  locale,
  annotations,
  setId,
  known,
  multiple,
  state,
  termIds,
  remove,
  onChange,
}: {
  label: string
  /** The link to where this field's choices are kept (`ChoicesLink`). */
  link?: React.ReactNode
  /** Whether it draws its own name row (`ValueEditor` の `named`). */
  named?: boolean
  locale: Locale
  annotations: FieldAnnotations
  setId: string | null
  /** The terms the document names, which is what the chosen list is drawn from. */
  known: EditableTerm[]
  multiple: boolean
  state: SlotState
  termIds: string[]
  remove?: { label: string, onClick: () => void }
  onChange: (state: SlotState, termIds: string[]) => void
}) {
  return (
    <Stack gap="tight" at={annotations.at}>
      <FieldHead label={named ? label : undefined} annotations={annotations} locale={locale} link={link} remove={remove} />
      <div className="md:max-w-md">
        {/* **The two indicators are shown beside the search box**, the way a
            translated field's stand beside its box (`fields.tsx` の
            `SlotEditor`) — this field has one box, language-less, and the
            search box is it. */}
        <TermPicker
          locale={locale}
          setId={setId}
          disabled={state !== "value"}
          chosen={resolveTerms(known, termIds)}
          onAdd={(id) => { onChange(state, multiple ? [...termIds, id] : [id]) }}
          onRemove={(id) => { onChange(state, termIds.filter((one) => one !== id)) }}
          trailing={(
            <StateSwitch
              state={state}
              onChange={(next) => { onChange(next, termIds) }}
              locale={locale}
            />
          )}
        />
      </div>
    </Stack>
  )
}

/**
 * The diseases under one key.
 *
 * **A row is one disease: which classifications name it, and what it is
 * called.** The two answer different questions — the terms are what a listing
 * counts it by, the name is what a reader reads — and neither stands in for the
 * other. `NASH` is what an article writes and `K758` is where it is filed.
 *
 * **A row naming no term is an ordinary row.** Diseases no classification holds
 * are in the articles, and a form that refused them would be a portal that
 * cannot record what was studied. **A row indicating nothing at all is dropped on
 * save**, the same as an empty number.
 *
 * **The names get no candidates.** The field holds what an article wrote, so
 * there is nothing to align it to; offering the spellings already in would pull
 * a curator away from the source they are copying.
 */
function DiseaseField({ label, named = true, link, locale, annotations, setId, known, state, diseases, remove, onChange }: {
  label: string
  /** The link to where this field's choices are kept (`ChoicesLink`). */
  link?: React.ReactNode
  /** Whether it draws its own name row (`ValueEditor` の `named`). */
  named?: boolean
  locale: Locale
  annotations: FieldAnnotations
  setId: string | null
  known: EditableTerm[]
  state: SlotState
  diseases: DiseaseRow[]
  remove?: { label: string, onClick: () => void }
  onChange: (next: { state: SlotState, diseases: DiseaseRow[] }) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const disabled = state !== "value"
  const box = `${CONTROL} text-sm disabled:opacity-50`
  const edit = (at: number, next: Partial<DiseaseRow>) => {
    onChange({ state, diseases: diseases.map((row, i) => (i === at ? { ...row, ...next } : row)) })
  }
  const empty = (row: DiseaseRow) =>
    row.termIds.length === 0 && row.nameJa.trim() === "" && row.nameEn.trim() === ""

  return (
    <Stack gap="tight" at={annotations.at}>
      <FieldHead label={named ? label : undefined} annotations={annotations} locale={locale} link={link} remove={remove} />
      {/* **The state toggles are shown at the right of the values**, level with the
          first row — where every other field puts them — rather than on a row
          of their own above the values. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 md:max-w-xl">
          <Stack gap="tight">
            {diseases.map((row, at) => (
              <div key={at} className="rounded border border-line px-3 py-2">
                <Stack gap="tight">
                  {/*
                  **The names come first.** They are what the row is called, so
                  reading down a list of diseases is reading down this line; the
                  codes are how each one is filed and sit under it.
                */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.nameJa}
                      disabled={disabled}
                      aria-label={t.diseaseNameJa}
                      placeholder={t.diseaseNameJa}
                      onChange={(event) => { edit(at, { nameJa: event.target.value }) }}
                      className={`${box} min-w-0 flex-1`}
                    />
                    <input
                      type="text"
                      value={row.nameEn}
                      disabled={disabled}
                      aria-label={t.diseaseNameEn}
                      placeholder={t.diseaseNameEn}
                      onChange={(event) => { edit(at, { nameEn: event.target.value }) }}
                      className={`${box} min-w-0 flex-1`}
                    />
                    <IconButton
                      name="trash"
                      label={t.removeDisease}
                      disabled={disabled}
                      onClick={() => {
                        onChange({ state, diseases: diseases.filter((_, i) => i !== at) })
                      }}
                    />
                  </div>
                  <TermPicker
                    locale={locale}
                    setId={setId}
                    kind="disease"
                    disabled={disabled}
                    chosen={resolveTerms(known, row.termIds)}
                    onAdd={(id) => { edit(at, { termIds: [...row.termIds, id] }) }}
                    onRemove={(id) => {
                      edit(at, { termIds: row.termIds.filter((one) => one !== id) })
                    }}
                  />
                </Stack>
              </div>
            ))}
            {!disabled && (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  icon={<Icon name="plus" />}
                  onClick={() => {
                    onChange({ state, diseases: [...diseases, emptyDiseaseRow()] })
                  }}
                >
                  {t.addDisease}
                </Button>
              </div>
            )}
            {!disabled && diseases.every(empty) && (
              <p className="text-ink-muted text-xs">{t.emptyDisease}</p>
            )}
          </Stack>
        </div>
        <span className="ml-auto flex h-9 shrink-0 items-center">
          <StateSwitch
            state={state}
            onChange={(next) => { onChange({ state: next, diseases }) }}
            locale={locale}
          />
        </span>
      </div>
    </Stack>
  )
}

/** The terms these identities name, dropping the ones the document did not send. */
function resolveTerms(known: readonly EditableTerm[], ids: readonly string[]): EditableTerm[] {
  const byId = new Map(known.map((term) => [term.id, term]))
  return ids.flatMap((id) => {
    const term = byId.get(id)
    return term === undefined ? [] : [term]
  })
}

/**
 * The terms a value names, and the box that finds more.
 *
 * **The chosen terms are listed and the rest are searched for**, whether the
 * vocabulary holds three terms or twelve thousand. One shape means the screen
 * does not change under the author when a vocabulary grows, and a list of every
 * ICD10 code is not a control anybody can use.
 *
 * **The candidates come from the server.** Sending a whole vocabulary so that
 * the box can filter it here would make the weight of the page follow the size
 * of the catalog; what is chosen already came with the document, so the choices
 * stay readable whether or not the box is ever used.
 *
 * **A chosen term is one control, and pressing it is what removes it** — the
 * condition and the way to lift it are the same object, as they are for a chip
 * over a listing.
 */
function TermPicker({ locale, setId, kind, disabled, chosen, onAdd, onRemove, trailing }: {
  locale: Locale
  setId: string | null
  /**
   * Which reading the box wants of what is typed. A disease is written as a
   * classification code as often as a word, and the code has to be normalised
   * and rolled up before the vocabulary is asked (`app/routes/admin-terms.ts`).
   */
  kind?: "disease"
  disabled: boolean
  chosen: EditableTerm[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  /**
   * Stood beside the search box, the way a translated field's state toggles
   * are shown beside its box (`fields.tsx` の `SlotEditor`). Only a field-level
   * picker has one — nested inside a disease row, there is no field-level
   * state to show.
   */
  trailing?: React.ReactNode
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const search = useFetcher<EditableTerm[]>()
  const wait = useRef<number | null>(null)
  const held = new Set(chosen.map((term) => term.id))
  const candidates = (search.data ?? [])
    .filter((term) => term.setId === setId && !held.has(term.id))
    .slice(0, PICKER_RESULTS)

  /**
   * **Asked once the keys are still**, not at every key: a vocabulary of
   * twelve thousand terms is searched on the server, and a burst of typing
   * would otherwise send a burst of questions whose answers arrive out of
   * order. Entering the box requests at once.
   */
  const ask = (value: string, pause: number) => {
    if (wait.current !== null) window.clearTimeout(wait.current)
    if (setId === null) return
    const query = new URLSearchParams({ set: setId, q: value.trim() })
    if (kind !== undefined) query.set("kind", kind)
    wait.current = window.setTimeout(() => {
      void search.load(`${termsPath()}?${query.toString()}`)
    }, pause)
  }

  return (
    <Stack gap="tight">
      {chosen.length === 0
        ? <Empty>{t.noTerm}</Empty>
        : (
            <ul className="flex flex-wrap gap-2">
              {chosen.map((term) => (
                <li key={term.id}>
                  <ValueChip remove={t.removeTerm} disabled={disabled} onRemove={() => { onRemove(term.id) }}>
                    {catalogLabel(term, locale)}
                  </ValueChip>
                </li>
              ))}
            </ul>
          )}
      <div className="flex items-center gap-2">
        <ComboBox
          label={t.findTerm}
          disabled={disabled || setId === null}
          options={candidates}
          keyOf={(term) => term.id}
          render={(term) => <CandidateWords term={term} locale={locale} kind={kind} />}
          loading={search.state !== "idle"}
          empty={t.noCandidate}
          more={candidates.length >= PICKER_RESULTS ? t.typeToNarrow(PICKER_RESULTS) : undefined}
          words={{ searching: t.searching, count: t.candidateCount }}
          onQuery={(value, typed) => { ask(value, typed ? SEARCH_PAUSE_MS : 0) }}
          onChoose={(term) => { onAdd(term.id) }}
        />
        {trailing}
      </div>
    </Stack>
  )
}

/**
 * A box to type in with a list that opens under it — **one combobox for every
 * list chosen from on this screen** (a vocabulary's terms, the keys to add), so
 * the keys and the look are learned once.
 *
 * WAI-ARIA APG, "list autocomplete" (`comboKey`): the list opens as the box is
 * entered, by the pointer or the keyboard, and as it is typed into; Up and Down
 * walk it while the caret stays in the box; Enter takes the one walked to and
 * never sends the form; Escape closes, a second empties. The caret stays in the
 * box after a choice, so the next one is a key away.
 */
function ComboBox<T>({ label, placeholder, disabled = false, options, keyOf, render, loading = false, empty, more, words, onQuery, onChoose, kept }: {
  label: string
  /** The grey word in the empty field; the label when absent. */
  placeholder?: string
  disabled?: boolean
  /** What the list offers for what is typed now. */
  options: readonly T[]
  keyOf: (option: T) => string
  render: (option: T) => React.ReactNode
  /** Whether the options are still being asked for. */
  loading?: boolean
  empty: string
  /** A line under a truncated list, indicating so. */
  more?: string
  words: { searching: string, count: (count: number) => string }
  /** What is typed, whenever it changes or the box is entered (typed: false). */
  onQuery?: (value: string, typed: boolean) => void
  onChoose: (option: T) => void
  /**
   * Keep the choice in the box, as these words, rather than emptying it — for a
   * choice that is confirmed by a button beside the box rather than acted on
   * as it is made. Typing again goes back to looking.
   */
  kept?: (option: T) => string
}) {
  const [find, setFind] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const optionId = (at: number) => `${listId}-${String(at)}`
  const shown = open && !disabled
  const at = Math.min(active, options.length - 1)
  const current = options[at]

  const look = (value: string) => {
    setFind(value)
    setActive(0)
    setOpen(true)
    onQuery?.(value, true)
  }
  const enter = () => {
    if (disabled || open) return
    setOpen(true)
    setActive(0)
    onQuery?.(find, false)
  }
  const choose = (option: T) => {
    onChoose(option)
    setFind(kept === undefined ? "" : kept(option))
    setOpen(false)
    setActive(0)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const next = comboKey({ open: shown, active, find }, event.key, options.length)
    if (next === null) return
    event.preventDefault()
    if (event.key === "Escape") event.stopPropagation()
    if (next.choose && current !== undefined) {
      choose(current)
      return
    }
    if (next.state.open && !shown) onQuery?.(find, false)
    setOpen(next.state.open)
    setActive(next.state.active)
    setFind(next.state.find)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && current !== undefined ? optionId(at) : undefined}
        // The browser's own suggestions are what someone typed in some other
        // box; over this one they hide the list that responds.
        autoComplete="off"
        spellCheck={false}
        value={find}
        disabled={disabled}
        aria-label={label}
        placeholder={placeholder ?? label}
        onChange={(event) => { look(event.target.value) }}
        onKeyDown={onKeyDown}
        onFocus={enter}
        onClick={enter}
        onBlur={() => { setOpen(false) }}
        className={`${CONTROL} w-full pr-8 text-sm disabled:opacity-50`}
      />
      {/* The indicator of a list that opens here, the way a pull-down draws it.
          Not a control of its own: the box is what is pressed. */}
      <Icon
        name="chevron-down"
        className={`pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-muted transition-transform ${shown ? "rotate-180" : ""}`}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={`absolute top-[calc(100%+0.25rem)] left-0 z-20 flex max-h-72 w-full overflow-y-auto ${MENU_PANEL}`}
        >
          {options.length === 0 && (
            <li role="presentation" className="px-4 py-2 text-ink-muted text-sm">{loading ? words.searching : empty}</li>
          )}
          {!loading && more !== undefined && (
            <li role="presentation" className="order-last border-line border-t px-4 py-2 text-ink-muted text-xs">{more}</li>
          )}
          {options.map((option, index) => (
            <li
              key={keyOf(option)}
              id={optionId(index)}
              role="option"
              aria-selected={index === at}
              // Pressed with the pointer, the box keeps the caret: taking it
              // away would close the list before the press lands.
              onMouseDown={(event) => { event.preventDefault() }}
              onMouseEnter={() => { setActive(index) }}
              onClick={() => { choose(option) }}
              className={`flex cursor-pointer items-baseline gap-2 px-4 py-2 text-sm ${index === at ? "bg-surface-hover" : ""}`}
            >
              {render(option)}
            </li>
          ))}
        </ul>
      )}
      <span role="status" className="sr-only">{shown && !loading ? words.count(options.length) : ""}</span>
    </div>
  )
}

/**
 * One candidate as the list reads it: **the words, not the key they are stored
 * under** — an id like `controlled-access-type-2` shows nothing a reader chooses
 * by. A disease keeps its code before the words: ICD-10 is what the box is typed
 * with, and what tells two names apart.
 */
export function CandidateWords({ term, locale, kind }: { term: EditableTerm, locale: Locale, kind?: "disease" }) {
  return (
    <>
      {kind === "disease" && <code className="shrink-0 text-ink-muted text-xs">{term.code}</code>}
      <span>{catalogLabel(term, locale)}</span>
    </>
  )
}

/** What a combobox holds between keys: whether its list is open, which option is walked to, what is typed. */
export interface ComboState {
  open: boolean
  active: number
  find: string
}

/**
 * **The keys of a combobox** (WAI-ARIA APG, "list autocomplete"). The list
 * opens as the box is entered — by the pointer or the keyboard — and as it is
 * typed into, and Down opens it again once it has been closed. Up and Down walk
 * it, wrapping, while the caret stays in the box; Enter takes the one walked to
 * and is never the form's submit; Escape closes the list, and a second Escape
 * empties the box. Any other key is the box's own (null).
 */
export function comboKey(
  state: ComboState,
  key: string,
  count: number,
): { state: ComboState, choose: boolean } | null {
  if (key === "ArrowDown" || key === "ArrowUp") {
    if (!state.open) return { state: { ...state, open: true, active: 0 }, choose: false }
    if (count === 0) return { state, choose: false }
    const from = Math.min(Math.max(state.active, 0), count - 1)
    const by = key === "ArrowDown" ? 1 : -1
    return { state: { ...state, active: (from + by + count) % count }, choose: false }
  }
  if (key === "Enter") return { state, choose: state.open && count > 0 }
  if (key === "Escape") {
    if (state.open) return { state: { ...state, open: false }, choose: false }
    if (state.find !== "") return { state: { ...state, find: "" }, choose: false }
    return null
  }
  return null
}

/**
 * The dataset's id, pinned from the screen the dataset is written on.
 *
 * **It is not part of the description.** The id goes into the `label_pin` table the moment
 * it is pinned — it neither waits for a save nor moves the entry's revision —
 * so it is posted as a form of its own beside the JSON save, and through a
 * fetcher so that what is typed in the form around it survives the answer.
 * Nothing is redirected: the listing under the screen is read again once the
 * `label_pin` table has moved.
 *
 * **Two ways to give it one**: an archive's accession is typed, and the portal's
 * own id is issued — the next NHA number, which nobody types, so the numbering
 * cannot be broken by hand. Both are settled by the same「割り当て」(`IdForm`),
 * at the row's height — the line
 * is a line of facts, and a 36px box among them is taller than the words.
 *
 * **The dates are read, never typed.** An archive's accession is dated by the
 * archive; a portal-issued id is dated by the version that first publishes it,
 * written at the publish (`publish.server.ts` の `withReleaseDate`) — so until
 * then it shows it is not out yet, and there is nothing here to set.
 */
function DatasetFacts({ view, locale }: {
  view: DatasetEditorView
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.datasetEditor
  const detail = messages.admin.detail
  const fetcher = useFetcher<DatasetLabelResult | null>()
  const dates = view.page.view

  return (
    <Stack gap="tight">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
        <span className="flex flex-wrap items-center gap-3">
          <span className={PANE_LABEL}>{t.idHeading}</span>
          {view.datasetLabel === null || view.datasetPinId === null
            ? (
                <fetcher.Form method="post" className="flex flex-wrap items-center gap-3">
                  <IdForm nextNhaId={view.nextNhaId} locale={locale} size="row" />
                </fetcher.Form>
              )
            : (
                <>
                  <span>{view.datasetLabel}</span>
                  <fetcher.Form method="post">
                    <input type="hidden" name="pinId" value={view.datasetPinId} />
                    <Confirm
                      label={detail.unpin}
                      title={detail.unpinTitle(view.datasetLabel)}
                      warning={detail.unpinDatasetWarning(isNhaId(view.datasetLabel))}
                      confirm={detail.unpinConfirm}
                      intent="unpin"
                      icon="close"
                      size="row"
                    />
                  </fetcher.Form>
                </>
              )}
        </span>
        <span className="flex items-center gap-3">
          <span className={PANE_LABEL}>{t.releaseDate}</span>
          <span>{dates.datePublished ?? t.notYet}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className={PANE_LABEL}>{t.dateModified}</span>
          <span>{dates.dateModified ?? t.notYet}</span>
        </span>
      </div>
      <p className="text-ink-muted text-xs">
        {view.portalIssued ? t.datesPortal : t.datesArchive}
        {t.idNote}
      </p>
      {/* The ID's answer floats like every other: issued, or refused because
          the label names something already or is spelled as an NHA id. */}
      <Answer
        answer={fetcher.data}
        locale={locale}
        ok={(answer) => answer.status === "issued"}
        said={(answer) => {
          switch (answer.status) {
            case "issued": return detail.issued(answer.label)
            case "taken": return detail.pinTaken
            case "reserved": return detail.pinReserved
            default: return null
          }
        }}
      />
    </Stack>
  )
}

/**
 * One experiment, collapsed to **a single line**: its name, how many values it
 * has, and what can be done to the whole of it — copy, move, delete — on
 * the same line.
 *
 * **The controls are shown over the line rather than inside the part that collapses.**
 * A button inside a `<summary>` is a control within a control: pressing it
 * would collapse the card as well. The collapsible itself is a `<details>`, so a focus jump
 * from the page opens it (`form.tsx` の `focusField`).
 */
function ExperimentCard({ locale, index, count, summary, note, open, onMove, onCopy, onRemove, children }: {
  locale: Locale
  index: number
  count: number
  summary: React.ReactNode
  note: string
  /** Whether there is a reason for this to be open right now. */
  open: boolean
  onMove: (by: number) => void
  onCopy: () => void
  onRemove: () => void
  children: React.ReactNode
}) {
  const t = messagesFor(locale).admin
  const [shown, setShown] = useState(open)
  const [reason, setReason] = useState(open)
  if (open !== reason) {
    setReason(open)
    setShown(collapsibleOpen(shown, open))
  }
  return (
    <div className="relative rounded border border-line">
      <details open={shown} onToggle={(event) => { setShown(event.currentTarget.open) }} className="group/collapsible">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-1.5 pr-44 pl-4 text-sm marker:content-none">
          <CollapsibleChevron />
          <span className="text-ink-muted text-xs">{index + 1}</span>
          <span className="min-w-0 truncate font-semibold">{summary}</span>
          <span className="shrink-0 text-ink-muted text-xs">{note}</span>
        </summary>
        <div className="border-line border-t px-4 py-3">{children}</div>
      </details>
      <div className="absolute top-0 right-2 flex h-12 items-center gap-1">
        <IconButton name="copy" label={t.datasetEditor.copyExperiment} onClick={onCopy} />
        <ReorderButtons
          at={index}
          of={count}
          labels={{ up: t.moveUp, down: t.moveDown }}
          onMove={onMove}
        />
        <IconButton name="trash" label={t.editor.remove} onClick={onRemove} />
      </div>
    </div>
  )
}

/**
 * An experiment with the same label and values under a new identity — the ids
 * inside are the experiment's own, so only the experiment's changes.
 */
export function copiedExperiment(experiment: ExperimentInput): ExperimentInput {
  return { ...structuredClone(experiment), id: newId() }
}
