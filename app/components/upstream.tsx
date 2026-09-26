import { useState } from "react"
import { useFetcher } from "react-router"

import type { ApplicationType, BranchStatus } from "~/admin/listing"
import type { DroppedValue } from "~/admin/templates"
import type { DatasetChoiceView, SeededFieldView, UpstreamBranchView, UpstreamChoiceView } from "~/admin/templates.server"
import { adminUpstreamBranchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, jgaEntryUrl } from "~/public/urls"
import type { loader as branchLoader } from "~/routes/admin-upstream-branch"

import { Dialog, Excerpt, Note, Stack } from "./base"
import { Flag, type FlagKind, Stated } from "./flags"
import { LanguageLabel } from "./fields"
import { Submit } from "./form"
import { Icon } from "./icons"
import { Code, DatasetIds, Empty, Fact, Facts, IdWithIcon, KeyValue, Pairs, Section, Td } from "./page"
import { researchFieldLabel, SEEDED_PATH } from "./research-fields"

/**
 * The parts both seeding screens are built from.
 *
 * They show the same thing in the same order — what is coming, what is not, and
 * why — because the two differ only in whether a research is made along with the
 * datasets.
 */

export function UpstreamNotConnected({ locale }: { locale: Locale }) {
  const t = messagesFor(locale).admin.templates
  return <Empty>{t.notConnected}</Empty>
}

/**
 * A branch's status in the portal, drawn as a glyph and a word.
 *
 * Whether the hum's research is already here is the question every row of the
 * branch listing is opened to answer, and a label that is or is not a link shows
 * it only to a reader who tries to press it. **The pair is the one the pane
 * narrows by** (`Stated`): the same three glyphs are shown beside the ticks, so the
 * shape a curator narrows by is the shape they then read down the rows. **The
 * glyphs differ from one another** — the glyph is what tells the states apart
 * at a glance, and the word shows which it is.
 */
export const BRANCH_STATUS_FLAG: Record<BranchStatus, FlagKind> = {
  held: "resolved",
  absent: "absent",
  unlabelled: "unknown",
}

/** The kind each type of application is drawn as, in its column and in the pane that narrows by it. */
export const APPLICATION_TYPE_FLAG: Record<ApplicationType, FlagKind> = {
  new: "newApplication",
  update: "updateApplication",
}

export function BranchStatusBadge({ branchStatus, locale }: {
  branchStatus: BranchStatus
  locale: Locale
}) {
  const t = messagesFor(locale).admin.templates
  return <Stated kind={BRANCH_STATUS_FLAG[branchStatus]}>{t.branchStatuses[branchStatus]}</Stated>
}

/**
 * What one press would create.
 *
 * Every dataset found is made, and one a research already holds is left out:
 * the `label_pin` table is unique across every label, so pinning it again would refuse the
 * whole seeding rather than that one row.
 *
 * **Without a word for the button it is a reading, not a form.**
 */
export function UpstreamChoice({ locale, choice, submit = null }: {
  locale: Locale
  choice: UpstreamChoiceView
  submit?: string | null
}) {
  const t = messagesFor(locale).admin.templates
  const free = choice.datasets.filter((entry) => entry.heldBy === null)

  return (
    <Stack gap="normal">
      {choice.fields.length > 0 && (
        <Section title={t.fields}>
          <Facts>
            {choice.fields.map((field) => (
              <Fact key={field.field} name={researchFieldLabel(SEEDED_PATH[field.field], locale) ?? field.field}>
                <SeededValue field={field} locale={locale} />
              </Fact>
            ))}
          </Facts>
        </Section>
      )}

      {/* **Nothing is ticked.** What the accession names is made, less what a
          research already holds, which the list says beside it; the form
          passes the rest on unchanged (`BranchDatasets`). **What was found
          and the press that makes it fit on one line** — the press is the
          answer to that one row, not a step of its own under it. */}
      <div className="flex flex-wrap items-center gap-3">
        <BranchDatasets locale={locale} datasets={choice.datasets} sayHeld={submit !== null} bare />
        {submit !== null && (
          <>
            {free.map((entry) => (
              <input key={entry.accession} type="hidden" name="accession" value={entry.accession} />
            ))}
            {/* **The indicator shows what the press does, and this one makes
                something.** */}
            {/* **Row height**: it is pressed for the one row it is shown in,
                beside that row's words, and at full height it would stand
                over the row it belongs to (`BUTTON_SIZE` の `row`). */}
            <Submit
              size="row"
              icon={<Icon name="plus" />}
              disabled={free.length === 0 && choice.fields.length === 0 ? t.allHeld : false}
            >
              {submit}
            </Submit>
          </>
        )}
      </div>

      {/* Said only where something will be made: a row the research
          already holds makes nothing, and its values go nowhere. */}
      {(submit === null || free.length > 0) && <DroppedNote locale={locale} dropped={choice.dropped} />}

      {choice.unreachable.length > 0 && (
        <p className="text-ink-muted text-sm">{t.unreachable(choice.unreachable.length)}</p>
      )}
    </Stack>
  )
}

/**
 * What upstream stated that matches no choice, said in one sentence
 * before it is made. **Nothing to do here and nowhere to go**: the field is
 * made unsettled and the value is left on it as a comment, so it is settled in
 * the dataset's own form, where the choices are.
 */
export function DroppedNote({ locale, dropped }: { locale: Locale, dropped: readonly DroppedValue[] }) {
  const t = messagesFor(locale).admin.templates
  if (dropped.length === 0) return null
  return (
    // **One box, and its first line names what it lists.** A sentence over a
    // list on the same background reads as a remark beside it rather than as the
    // list's caption; boxed, the name, the rows and what becomes of them are
    // one thing, and shown under the found row it is about that row. What is
    // lacking is shown with `warning` (the choice is missing, nothing is refused).
    // As wide as what it holds: a row of name and value stretched across the
    // section leaves the value far from its name.
    <div className="w-fit max-w-full">
      <Note kind="warning">
        <Stack gap="tight">
          <p className="font-semibold text-ink">{t.droppedHeading(dropped.length)}</p>
          <Facts>
            {dropped.map((value) => (
              <Fact key={`${value.keyCode} ${value.value}`} name={value.keyLabel}>{value.value}</Fact>
            ))}
          </Facts>
          <p className="text-ink-muted">{t.droppedSaid}</p>
        </Stack>
      </Note>
    </div>
  )
}

/**
 * **One list, drawn as the public pages draw a name and its value** (`Pairs`):
 * the application's own facts and what goes into the research are one reading,
 * so the title and the investigator are said once. A rule between the pairs is
 * what tells where a long value ends and the next name begins.
 */
export function BranchPairs({ locale, branch, fields, applicationId }: {
  locale: Locale
  branch: Pick<UpstreamBranchView, "humLabel" | "approvedOn">
  fields: SeededFieldView[]
  /** Said first where nothing around the list names the branch — a panel, not the branch's own screen. */
  applicationId?: string
}) {
  const t = messagesFor(locale).admin.templates
  return (
    <Pairs>
      {applicationId !== undefined && (
        <KeyValue title={t.application}><Code>{applicationId}</Code></KeyValue>
      )}
      <KeyValue title={messagesFor(locale).research.researchId}>
        {branch.humLabel ?? <Flag kind="short">{t.noHumLabel}</Flag>}
      </KeyValue>
      <KeyValue title={t.approvedOn}>{branch.approvedOn ?? ""}</KeyValue>
      {fields.map((field) => (
        <KeyValue key={field.field} title={researchFieldLabel(SEEDED_PATH[field.field], locale) ?? field.field}>
          <SeededValue field={field} locale={locale} />
        </KeyValue>
      ))}
    </Pairs>
  )
}

/**
 * One value the application states, in both its languages.
 *
 * **The two languages stand one above the other**, each after its `ja` / `en`
 * label: side by side they read as two values rather than one said twice, and
 * told apart by colour alone the pair reads as one statement and a quieter
 * second one.
 */
function SeededValue({ field, locale }: { field: SeededFieldView, locale: Locale }) {
  if (field.ja === "" && field.en === "") {
    return <span className="text-ink-muted">{messagesFor(locale).admin.templates.neither}</span>
  }
  return (
    <span className="flex flex-col gap-2">
      {(["ja", "en"] as const).map((language) => field[language] !== "" && (
        <span key={language} className="flex gap-2">
          {/* A fixed width, so the ja and en texts start at one edge. */}
          <span className="w-5 shrink-0"><LanguageLabel language={language} /></span>
          <span lang={language}>{field[language]}</span>
        </span>
      ))}
    </span>
  )
}

/** How many of a branch's datasets a row names before it collapses the rest. */
const SHOWN_DATASETS = 3

/**
 * A branch's cells from its approval on, **drawn the same in every table of
 * branches** — the listing of applications and a draft's table of them to import
 * from — so that one branch never looks like two things.
 */
export function BranchCells({ row, locale }: { row: UpstreamBranchView, locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <>
      <Td nowrap>{row.approvedOn ?? ""}</Td>
      <Td floor="min-w-64">
        <Excerpt more={messages.search.readMore} less={messages.search.showLess}>
          {row.titleJa === "" ? row.titleEn : row.titleJa}
        </Excerpt>
      </Td>
      <Td nowrap>{row.piName}</Td>
      <Td>
        {/* **The archive is where a dataset is described**, and a branch is
            often approved before the ones it registered are published, so the
            portal has nothing to show of them yet (`public/urls.ts` の
            `jgaEntryUrl`). */}
        <DatasetIds
          shown={SHOWN_DATASETS}
          newTab
          locale={locale}
          items={row.datasets.map((accession) => ({ label: accession, to: jgaEntryUrl(accession) }))}
        />
      </Td>
    </>
  )
}

/**
 * A branch's ID that opens the branch's details, in a panel over the table.
 *
 * **Read here, chosen in the row.** Which branch to import from is decided by
 * reading it, and a table that sends the reader to another screen to read makes
 * them find the table again to choose. The panel reads the branch's own screen
 * when it opens — the table has only the columns — and draws the same list of
 * names and values that screen does, and the datasets it registered. It offers
 * nothing to press but the close button: choosing is the row's.
 */
export function BranchDialog({ applicationId, locale }: { applicationId: string, locale: Locale }) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const fetcher = useFetcher<typeof branchLoader>()
  const [open, setOpen] = useState(false)
  const view = fetcher.data

  return (
    <>
      <button
        type="button"
        className="text-brand hover:text-brand-light hover:underline"
        onClick={() => {
          setOpen(true)
          if (fetcher.state === "idle" && fetcher.data === undefined) {
            void fetcher.load(href(locale, adminUpstreamBranchPath(applicationId)))
          }
        }}
      >
        <Code>{applicationId}</Code>
      </button>
      <Dialog
        title={t.branchHeading}
        held={{ open, close: () => { setOpen(false) } }}
        dismiss={messages.comment.close}
        wide
      >
        {view === undefined
          ? <Empty>{t.branchLoading}</Empty>
          : view.branch === null || view.chosen === null
            ? <UpstreamNotConnected locale={locale} />
            : (
                <Stack gap="block">
                  {/* **The panel is named by its kind and the branch is the
                      first of its values** (the rule every panel keeps), so the
                      ID is shown where the branch's own screen puts it beside
                      the name — the first thing read. */}
                  <BranchPairs locale={locale} branch={view.branch} fields={view.chosen.fields} applicationId={applicationId} />
                  <BranchDatasets locale={locale} datasets={view.chosen.datasets} />
                </Stack>
              )}
      </Dialog>
    </>
  )
}

/**
 * The datasets a branch registered, read as part of what the application contains
 * — on the branch's own screen and in the panel a draft's table opens.
 *
 * **Each ID leads to the archive**, the same way the listing's cell does: the
 * portal may have nothing of it yet. **One a research already holds is marked as such**,
 * with the link to that research: it is left out when a research is made from
 * the branch, and a reader looking for it finds where it is.
 */
export function BranchDatasets({ locale, datasets, sayHeld = false, bare = false }: {
  locale: Locale
  datasets: readonly DatasetChoiceView[]
  /**
   * Say which rows a research already holds. **Only where the list is what
   * will be created** — there it is the reason a row is not made; where it is
   * read, the row is the application's own and needs no word beside it.
   */
  sayHeld?: boolean
  /**
   * Without a heading of its own, inside the section that found it. **Where
   * one accession was looked up**, the list is the answer to the box above it
   * rather than a part of an application, and a heading would stand it beside
   * the section as a second one.
   */
  bare?: boolean
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const list = datasets.length === 0
    ? <Empty>{t.noDatasets}</Empty>
    : (
        <ul className="flex flex-col gap-2 text-sm">
          {datasets.map((entry) => (
            <li key={entry.accession} className="flex flex-wrap items-center gap-2">
              {/* The icon and the link to the archive the listing's cell gives. */}
              <IdWithIcon kind="dataset" to={jgaEntryUrl(entry.accession)} newTab locale={locale}>{entry.accession}</IdWithIcon>
              {entry.description !== "" && <span className="text-ink-muted">{entry.description}</span>}
              {sayHeld && entry.heldBy !== null && <span className="text-ink-muted text-xs">{t.taken}</span>}
            </li>
          ))}
        </ul>
      )
  return bare ? list : <Section title={t.registered}>{list}</Section>
}
