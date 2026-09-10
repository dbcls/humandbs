import { Link } from "react-router"

import { mergeInitial, type MergeRow } from "~/admin/templates"
import type { UpstreamDraftView } from "~/admin/templates.server"
import { adminResearchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { Fold, PANE_LABEL, PaneHeading, Stack } from "./base"
import { Submit, TextArea } from "./form"
import { Empty } from "./page"

/**
 * The draft and the application, put side by side so that a third value can be
 * written.
 *
 * **The two columns are read-only and the box under them is not.** What goes in
 * is often neither of them — a curator rewrites a title the application states
 * awkwardly — so a control that only chose between the two would leave nowhere
 * to write (`docs/editing.md` の「既存の下書きに取り込む」).
 *
 * **Fields where the two agree are folded away.** A version bump changes a few
 * of them, and sixteen boxes with nothing to decide bury the ones that matter.
 */
export function UpstreamMerge({ locale, view }: { locale: Locale, view: UpstreamDraftView }) {
  const t = messagesFor(locale).admin.templates
  const rows = view.merge ?? []
  const differing = rows.filter((row) => row.current !== row.incoming)
  const agreeing = rows.filter((row) => row.current === row.incoming)

  return (
    <Stack gap="block">
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
        <Stack gap="normal">
          <PaneHeading title={t.field.provider} level="h3" rule="start" />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="provider" defaultChecked />
            <span>
              {[view.provider.nameJa, view.provider.affiliationJa].filter((one) => one !== "").join(" / ")}
              <span className="block text-ink-muted text-xs">{t.takeProviderNote}</span>
            </span>
          </label>
        </Stack>
      )}

      <Stack gap="normal">
        <PaneHeading title={t.datasets} level="h3" rule="start" />
        {view.datasets.length === 0
          ? <Empty>{t.noDatasets}</Empty>
          : (
              <ul className="flex flex-col gap-2 text-sm">
                {view.datasets.map((entry) => (
                  <li key={entry.accession} className="flex flex-wrap items-center gap-2">
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
      </Stack>

      <div><Submit variant="primary">{t.apply}</Submit></div>
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
      <TextArea
        label={`${t.field[row.field]} — ${language}`}
        name={fieldKey(row)}
        value={mergeInitial(row)}
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
