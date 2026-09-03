import { Form, Link } from "react-router"

import type { UpstreamChoiceView } from "~/admin/templates.server"
import { adminCatalogPath, adminResearchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { PaneHeading, Stack } from "./base"
import { Field, Submit } from "./form"
import { Empty } from "./page"

/**
 * The parts both seeding screens are built from.
 *
 * They show the same thing in the same order — what is coming, what is not, and
 * why — because the two differ only in whether a research is made along with the
 * datasets (docs/editing.md の「上流からの下書き」).
 */

/**
 * A `GET` form, so a search has an address that can be kept. The reads behind it
 * take a second or so, which is why it is a button rather than a box that
 * searches as it is typed.
 */
export function UpstreamSearch({ locale, action, keyword }: {
  locale: Locale
  action: string
  keyword: string
}) {
  const t = messagesFor(locale).admin.templates
  return (
    <Form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <Field type="search" label={t.keyword} name="q" value={keyword} width="w-96" />
      <Submit variant="primary">{t.find}</Submit>
    </Form>
  )
}

export function UpstreamNotConnected({ locale, dra }: { locale: Locale, dra: boolean }) {
  const t = messagesFor(locale).admin.templates
  return <Empty>{dra ? t.notConnectedDra : t.notConnected}</Empty>
}

/**
 * What one press would create.
 *
 * Every dataset is checked to begin with and one already held is not offered:
 * the ledger is unique across every label, so pinning it again would refuse the
 * whole seeding rather than that one row.
 */
export function UpstreamChoice({ locale, choice, submit }: {
  locale: Locale
  choice: UpstreamChoiceView
  submit: string
}) {
  const t = messagesFor(locale).admin.templates
  const free = choice.datasets.filter((entry) => entry.heldBy === null)

  return (
    <Stack gap="block">
      {choice.fields.length > 0 && (
        <Stack gap="normal">
          <PaneHeading title={t.fields} level="h3" rule="start" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {choice.fields.map((field) => (
              <div key={field.field} className="contents">
                <dt className="text-ink-muted">{t.field[field.field]}</dt>
                <dd>{languages(t, field.ja, field.en)}</dd>
              </div>
            ))}
          </dl>
        </Stack>
      )}

      <Stack gap="normal">
        <PaneHeading title={t.datasets} level="h3" rule="start" />
        {choice.datasets.length === 0
          ? <Empty>{t.noDatasets}</Empty>
          : (
              <ul className="flex flex-col gap-2 text-sm">
                {choice.datasets.map((entry) => (
                  <li key={entry.accession} className="flex flex-wrap items-baseline gap-2">
                    <label className="flex items-baseline gap-2">
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
      </Stack>

      {choice.unreachable.length > 0 && (
        <p className="text-ink-muted text-sm">{t.unreachable(choice.unreachable.length)}</p>
      )}

      {choice.dropped.length > 0 && (
        <Stack gap="normal">
          <PaneHeading title={t.dropped} level="h3" rule="start" />
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
              <Link to={href(locale, adminCatalogPath())}>{t.openCatalog}</Link>
            </p>
          </Stack>
        </Stack>
      )}

      <div>
        <Submit variant="primary" disabled={free.length === 0 && choice.fields.length === 0}>
          {submit}
        </Submit>
      </div>
    </Stack>
  )
}

function languages(
  t: ReturnType<typeof messagesFor>["admin"]["templates"],
  ja: boolean,
  en: boolean,
): string {
  if (ja && en) return t.both
  if (ja) return t.jaOnly
  if (en) return t.enOnly
  return t.neither
}
