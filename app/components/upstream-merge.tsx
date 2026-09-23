import { Link } from "react-router"

import { mergeInitial, type MergeRow } from "~/admin/templates"
import type { UpstreamDraftView } from "~/admin/templates.server"
import { adminDraftUpstreamPath, adminResearchPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { Fold, Note, PANE_LABEL, Stack } from "./base"
import { Checkbox, Submit, TextArea } from "./form"
import { Icon } from "./icons"
import { Empty, Section } from "./page"

/**
 * The draft and the application, put side by side so that a third value can be
 * written.
 *
 * **The two columns are read-only and the box under them is not.** What goes in
 * is often neither of them — a curator rewrites a title the application states
 * awkwardly — so a control that only chose between the two would leave nowhere
 * to write (`docs/editing.md` の「下書きを外から作る」).
 *
 * **Fields where the two agree are folded away.** A version bump changes a few
 * of them, and sixteen boxes with nothing to decide bury the ones that matter.
 *
 * **`view.branch` is not null here** — the screen only draws this face once a
 * branch has been chosen — so its hum can be compared against the draft's own.
 */
export function UpstreamMerge({ locale, view }: { locale: Locale, view: UpstreamDraftView }) {
  const t = messagesFor(locale).admin.templates
  const rows = view.merge ?? []
  const differing = rows.filter((row) => row.current !== row.incoming)
  const agreeing = rows.filter((row) => row.current === row.incoming)

  return (
    <Stack gap="block">
      {/* **A way back to the table, distinct from the name row's way out.**
          The name row's `AdminBack` leaves for the research's own screen;
          this one returns to the table of branches this face was chosen from
          (`docs/editing.md` の「取り込みの面」). */}
      <AdminBack
        to={href(locale, adminDraftUpstreamPath(view.researchId, view.draftId))}
        label={t.backToBranches}
        icon="chevron-left"
      />

      {/* **Nothing here stops the take-in.** The branch's own research ID
          disagreeing with the draft's is stated rather than refused — a
          version bump can be approved under a corrected ID before the ledger
          catches up (`docs/editing.md` の「行き先」). */}
      {view.branch?.humLabel != null
        && view.humLabel !== null && view.branch.humLabel !== view.humLabel && (
        <Note kind="warning">{t.humDiffers(view.branch.humLabel, view.humLabel)}</Note>
      )}

      <Stack gap="normal">
        {differing.map((row) => <MergeField key={fieldKey(row)} locale={locale} row={row} />)}
        {agreeing.length > 0 && (
          <Fold summary={t.sameCount(agreeing.length)}>
            <Stack gap="normal">
              {agreeing.map((row) => <MergeField key={fieldKey(row)} locale={locale} row={row} />)}
            </Stack>
          </Fold>
        )}
      </Stack>

      {view.provider !== null && (
        <Section title={t.field.provider}>
          <Checkbox
            label={[view.provider.nameJa, view.provider.affiliationJa]
              .filter((one) => one !== "")
              .join(" / ")}
            name="provider"
            checked
            hint={t.takeProviderNote}
          />
        </Section>
      )}

      <Section title={t.registered}>
        {view.datasets.length === 0
          ? <Empty>{t.noDatasets}</Empty>
          : (
              <ul className="flex flex-col gap-2 text-sm">
                {view.datasets.map((entry) => (
                  <li key={entry.accession} className="flex flex-wrap items-center gap-2">
                    <Checkbox
                      label={entry.accession}
                      name="accession"
                      value={entry.accession}
                      checked={entry.heldBy === null}
                      disabled={entry.heldBy !== null}
                    />
                    {entry.description !== "" && (
                      <span className="text-ink-muted">{entry.description}</span>
                    )}
                    {entry.heldBy !== null && (
                      <Link to={href(locale, adminResearchPath(entry.heldBy))} className="text-xs">
                        {t.openHolder}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
      </Section>

      <div><Submit variant="primary" icon={<Icon name="download" />}>{t.apply}</Submit></div>
    </Stack>
  )
}

function MergeField({ locale, row }: { locale: Locale, row: MergeRow }) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const language = messages.admin.contents.languages[row.language]
  return (
    <Stack gap="tight">
      <div className="grid gap-3 md:grid-cols-2">
        <Sided label={t.inDraft} value={row.current} />
        <Sided label={t.inApplication} value={row.incoming} />
      </div>
      {/* The same face and size as the two panels above, which is what lets a
          reader see this as one of the three readings of one sentence. */}
      <TextArea
        label={`${t.field[row.field]} — ${language}`}
        name={fieldKey(row)}
        value={mergeInitial(row)}
        look="plain"
        rows={4}
      />
    </Stack>
  )
}

/** One side of the comparison. It is text, not a control: nothing here is typed into. */
function Sided({ label, value }: { label: string, value: string }) {
  return (
    <Stack gap="tight">
      <span className={PANE_LABEL}>{label}</span>
      <p className="whitespace-pre-wrap break-words rounded border border-line px-2 py-1 text-sm">
        {value}
      </p>
    </Stack>
  )
}

function fieldKey(row: MergeRow): string {
  return `${row.field}.${row.language}`
}
