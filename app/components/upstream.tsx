import { Link } from "react-router"

import type { BranchStanding } from "~/admin/listing"
import type { UpstreamChoiceView } from "~/admin/templates.server"
import { adminExperimentFieldsPath, adminResearchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { Stack, Stated } from "./base"
import { Submit } from "./form"
import { Icon, type IconName } from "./icons"
import { Empty, Section } from "./page"

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
 * Every dataset is checked to begin with and one already held is not offered:
 * the ledger is unique across every label, so pinning it again would refuse the
 * whole seeding rather than that one row.
 *
 * **Without a word for the button it is a reading of the branch, not a form.**
 * The datasets are ticked where they arrive, and that is the screen the draft
 * already exists on.
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
                <dt className="text-ink-muted">{t.field[field.field]}</dt>
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

      <Section title={t.registered}>
        {choice.datasets.length === 0
          ? <Empty>{t.noDatasets}</Empty>
          : (
              <ul className="flex flex-col gap-2 text-sm">
                {choice.datasets.map((entry) => (
                  <li key={entry.accession} className="flex flex-wrap items-center gap-2">
                    {submit === null
                      ? <span className="font-mono">{entry.accession}</span>
                      : (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              name="accession"
                              value={entry.accession}
                              defaultChecked={entry.heldBy === null}
                              disabled={entry.heldBy !== null}
                            />
                            <span className="font-mono">{entry.accession}</span>
                          </label>
                        )}
                    {entry.description !== "" && (
                      <span className="text-ink-muted">{entry.description}</span>
                    )}
                    <span className="text-ink-muted text-xs">
                      {t.experiments(entry.experiments)}
                    </span>
                    {entry.heldBy !== null && (
                      <Link
                        to={href(locale, adminResearchPath(entry.heldBy))}
                        className="text-xs"
                      >
                        {t.taken}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
      </Section>

      {choice.unreachable.length > 0 && (
        <p className="text-ink-muted text-sm">{t.unreachable(choice.unreachable.length)}</p>
      )}

      {choice.dropped.length > 0 && (
        <Section title={t.dropped}>
          <Stack gap="tight">
            <ul className="flex flex-col gap-1 text-sm">
              {choice.dropped.map((value) => (
                <li key={`${value.keyCode} ${value.value}`} className="flex flex-wrap gap-2">
                  <span className="text-ink-muted">{value.keyCode}</span>
                  <span>{value.value}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink-muted text-xs">
              {t.droppedHint}
              {" "}
              <Link to={href(locale, adminExperimentFieldsPath())}>{t.openCatalog}</Link>
            </p>
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
