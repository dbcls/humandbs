import { Form, Link } from "react-router"

import type { UpstreamChoiceView } from "~/admin/templates.server"
import { adminCatalogPath, adminResearchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

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
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-xs">{t.keyword}</span>
        <input
          type="search"
          name="q"
          defaultValue={keyword}
          className="w-96 rounded-sm border border-line px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        className="cursor-pointer rounded-sm bg-brand px-4 py-1.5 text-sm text-white"
      >
        {t.find}
      </button>
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
    <div className="flex flex-col gap-5">
      {choice.fields.length > 0 && (
        <div>
          <h3 className="mb-2 font-bold text-sm">{t.fields}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {choice.fields.map((field) => (
              <div key={field.field} className="contents">
                <dt className="text-ink-muted">{t.field[field.field]}</dt>
                <dd>{languages(t, field.ja, field.en)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h3 className="mb-2 font-bold text-sm">{t.datasets}</h3>
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
      </div>

      {choice.unreachable.length > 0 && (
        <p className="text-ink-muted text-sm">{t.unreachable(choice.unreachable.length)}</p>
      )}

      {choice.dropped.length > 0 && (
        <div>
          <h3 className="mb-2 font-bold text-sm">{t.dropped}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {choice.dropped.map((value) => (
              <li key={`${value.keyCode} ${value.value}`} className="flex flex-wrap gap-2">
                <span className="text-ink-muted">{value.keyCode}</span>
                <span>{value.value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-muted text-xs">
            {t.droppedHint}
            {" "}
            <Link to={href(locale, adminCatalogPath())}>{t.openCatalog}</Link>
          </p>
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={free.length === 0 && choice.fields.length === 0}
          className="cursor-pointer rounded-sm bg-brand px-4 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit}
        </button>
      </div>
    </div>
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
