import { useState } from "react"
import { useFetcher } from "react-router"

import type { BranchStanding } from "~/admin/listing"
import type { DatasetChoiceView, SeededFieldView, UpstreamBranchView, UpstreamChoiceView } from "~/admin/templates.server"
import { adminExperimentFieldsPath, adminUpstreamBranchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, jgaEntryUrl } from "~/public/urls"
import type { loader as branchLoader } from "~/routes/admin-upstream-branch"

import { ButtonLink, Chevron, Clamped, Dialog, Excerpt, Stack, Stated } from "./base"
import { LanguageMark } from "./fields"
import { Submit } from "./form"
import { Icon, type IconName } from "./icons"
import { Code, Empty, ExternalLink, KeyValue, Pairs, Section, Td } from "./page"
import { researchFieldLabel, SEEDED_PATH } from "./research-fields"

/**
 * The parts both seeding screens are built from.
 *
 * They show the same thing in the same order — what is coming, what is not, and
 * why — because the two differ only in whether a research is made along with the
 * datasets (docs/editing.md の「下書きを外から作る」).
 */

export function UpstreamNotConnected({ locale }: { locale: Locale }) {
  const t = messagesFor(locale).admin.templates
  return <Empty>{t.notConnected}</Empty>
}

/**
 * Where a branch stands with the portal, drawn as a glyph and a word.
 *
 * Whether the hum's research is already here is the question every row of the
 * branch listing is opened to answer, and a label that is or is not a link says
 * it only to a reader who tries to press it. **The pair is the one the pane
 * narrows by** (`Stated`): the same three glyphs stand beside the ticks, so the
 * shape a curator narrows by is the shape they then read down the rows. **The
 * glyphs differ from one another** — the glyph is what tells the states apart
 * at a glance, and the word says which it is.
 */
export const STANDING_MARK: Record<BranchStanding, IconName> = {
  held: "check",
  absent: "circle-slash",
  unlabelled: "help-circle",
}

export function BranchStandingMark({ standing, locale }: {
  standing: BranchStanding
  locale: Locale
}) {
  const t = messagesFor(locale).admin.templates
  return <Stated icon={STANDING_MARK[standing]}>{t.standings[standing]}</Stated>
}

/**
 * What one press would create.
 *
 * Every dataset found is made, and one a research already holds is left out:
 * the ledger is unique across every label, so pinning it again would refuse the
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
    <Stack gap="block">
      {choice.fields.length > 0 && (
        <Section title={t.fields}>
          {/* **The two languages stand one above the other.** Side by side
              they read as two values rather than one said twice, and a
              statement of aims runs long enough that the second column would
              begin where the first is still going.

              **Which of the two it is, is said by a word.** Told apart by
              colour alone the pair reads as one statement and a quieter
              second one, and nothing on the screen says the quieter one is
              the English — least of all to a reader who cannot see the
              difference. With the word there, both take the colour of text. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            {choice.fields.map((field) => (
              <div key={field.field} className="contents">
                <dt className="text-ink-muted">{researchFieldLabel(SEEDED_PATH[field.field], locale) ?? field.field}</dt>
                <dd className="flex flex-col gap-2">
                  {field.ja === "" && field.en === ""
                    ? <span className="text-ink-muted">{t.neither}</span>
                    : (["ja", "en"] as const).map((language) => (
                        field[language] === ""
                          ? null
                          : (
                              <span key={language} className="flex gap-2">
                                <span className="w-5 shrink-0 text-ink-muted text-sm" lang={language}>
                                  {language}
                                </span>
                                <span lang={language}>{field[language]}</span>
                              </span>
                            )
                      ))}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {/* **Nothing is ticked.** What the accession names is made, less what a
          research already holds, which the list says beside it; the form
          carries the rest as it stands (`BranchDatasets`). */}
      <BranchDatasets locale={locale} datasets={choice.datasets} sayHeld={submit !== null} bare />
      {submit !== null && free.map((entry) => (
        <input key={entry.accession} type="hidden" name="accession" value={entry.accession} />
      ))}

      {choice.unreachable.length > 0 && (
        <p className="text-ink-muted text-sm">{t.unreachable(choice.unreachable.length)}</p>
      )}

      {choice.dropped.length > 0 && (
        <Section title={t.dropped} note={t.droppedNote}>
          <Stack gap="tight">
            {/* **The key is called by its name**, the one the form and the
                catalog screen give it; its code is how the content addresses
                it, and a curator reading this list does not know it by that. */}
            <ul className="flex flex-col gap-1 text-sm">
              {choice.dropped.map((value) => (
                <li key={`${value.keyCode} ${value.value}`} className="flex flex-wrap gap-2">
                  <span className="text-ink-muted">{value.keyLabel}</span>
                  <span>{value.value}</span>
                </li>
              ))}
            </ul>
            <div>
              <ButtonLink size="row" to={href(locale, adminExperimentFieldsPath())}>
                {t.openCatalog}
                <Chevron dir="right" />
              </ButtonLink>
            </div>
          </Stack>
        </Section>
      )}

      {submit !== null && (
        <div>
          {/* **The mark says what the press does, and this one makes
              something** — a draft on one screen, a dataset on the other. The
              way in from the application is what carries `download`
              (`docs/ui.md` の「押せるもの」). */}
          <Submit
            variant="primary"
            icon={<Icon name="plus" />}
            disabled={free.length === 0 && choice.fields.length === 0}
          >
            {submit}
          </Submit>
        </div>
      )}
    </Stack>
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
        {branch.humLabel ?? <span className="text-ink-muted">{t.noHumLabel}</span>}
      </KeyValue>
      <KeyValue title={t.approvedOn}>{branch.approvedOn ?? ""}</KeyValue>
      {fields.map((field) => (
        <KeyValue key={field.field} title={researchFieldLabel(SEEDED_PATH[field.field], locale) ?? field.field}>
          {field.ja === "" && field.en === ""
            ? <span className="text-ink-muted">{t.neither}</span>
            : (
                <span className="flex flex-col gap-2">
                  {(["ja", "en"] as const).map((language) => field[language] !== "" && (
                    <span key={language} className="flex gap-2">
                      {/* A fixed width, so the ja and en texts start at one edge. */}
                      <span className="w-5 shrink-0"><LanguageMark language={language} /></span>
                      <span lang={language}>{field[language]}</span>
                    </span>
                  ))}
                </span>
              )}
        </KeyValue>
      ))}
    </Pairs>
  )
}

/** How many of a branch's datasets a row names before it folds the rest. */
const SHOWN_DATASETS = 3

/**
 * A branch's cells from its approval on, **drawn the same in every table of
 * branches** — the listing of applications and a draft's table of them to take
 * in from — so that one branch never looks like two things.
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
        <Clamped
          shown={SHOWN_DATASETS}
          more={(rest) => messages.search.andMore(rest)}
          less={messages.search.showLess}
          items={row.datasets.map((accession) => (
            // **One row, one way of aligning.** The external link is a box that
            // centres its contents, so the glyph beside it is centred with it
            // rather than sat on the baseline; and the box sits by its top,
            // because a box that centres takes its baseline from the words
            // inside and would stretch the row past the table's line height.
            <span key={accession} className="inline-flex items-center gap-1 align-top text-nowrap">
              <Icon name="database" aria-hidden="true" className="text-ink-muted" />
              <ExternalLink to={jgaEntryUrl(accession)} locale={locale}>{accession}</ExternalLink>
            </span>
          ))}
        />
      </Td>
    </>
  )
}

/**
 * A branch's ID that opens what the branch says, in a panel over the table.
 *
 * **Read here, chosen in the row.** Which branch to take in from is decided by
 * reading it, and a table that sends the reader to another screen to read makes
 * them find their way back to choose. The panel reads the branch's own screen
 * when it opens — the table has only the columns — and draws the same list of
 * names and values that screen does, and the datasets it registered. It offers
 * nothing to press but the way out: choosing is the row's.
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
                      ID stands where the branch's own screen puts it beside
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
 * The datasets a branch registered, read as part of what the application says
 * — on the branch's own screen and in the panel a draft's table opens.
 *
 * **Each ID leads to the archive**, the same way the listing's cell does: the
 * portal may have nothing of it yet. **One a research already holds says so**,
 * with the way to that research: it is left out when a research is made from
 * the branch, and a reader looking for it finds where it is.
 */
export function BranchDatasets({ locale, datasets, sayHeld = false }: {
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
              {/* The mark and the way to the archive the listing's cell gives. */}
              <span className="inline-flex items-center gap-1">
                <Icon name="database" aria-hidden="true" className="text-ink-muted" />
                <ExternalLink to={jgaEntryUrl(entry.accession)} locale={locale}>{entry.accession}</ExternalLink>
              </span>
              {entry.description !== "" && <span className="text-ink-muted">{entry.description}</span>}
              {sayHeld && entry.heldBy !== null && <span className="text-ink-muted text-xs">{t.taken}</span>}
            </li>
          ))}
        </ul>
      )
  return bare ? list : <Section title={t.registered}>{list}</Section>
}
