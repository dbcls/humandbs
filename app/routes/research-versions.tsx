import { Link } from "react-router"

import {
  Card,
  Empty,
  KeyValue,
  Page,
  PageHead,
  UntranslatedNotice,
  Value,
} from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { releaseListPage } from "~/public/pages.server"
import { datasetPath, href, readLocale, researchVersionPath } from "~/public/urls"

import type { Route } from "./+types/research-versions"

export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return { locale, view: await releaseListPage({ locale, humId: params.humId }) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.view.humLabel} - NBDC Human Database` }]
}

/**
 * What each published version brought. The comparison is between neighbours in
 * the *published* sequence, so a version that has been withdrawn does not leave
 * the reader looking at a difference against something they cannot open.
 */
export default function ResearchVersions({ loaderData }: Route.ComponentProps) {
  const { locale, view } = loaderData
  const messages = messagesFor(locale)
  const t = messages.research

  return (
    <Page>
      <PageHead label={view.humLabel}>{t.releaseInfo}</PageHead>
      <Card>
        <UntranslatedNotice show={view.untranslated} locale={locale} />
        <ul className="space-y-6">
          {view.versions.map((version) => (
            <li key={version.number} className="rounded border border-line">
              <h2 className="flex items-baseline justify-between gap-3 bg-surface px-4 py-2">
                <Link to={href(locale, researchVersionPath(view.humLabel, version.number))}>
                  {version.label}
                </Link>
                <span className="text-ink-muted text-sm">{version.releaseDate}</span>
              </h2>
              <div className="grid gap-6 px-4 py-4 sm:grid-cols-[18rem_1fr]">
                <KeyValue title={t.datasetsAddedInRelease}>
                  {version.addedDatasetLabels.length === 0
                    ? <Empty>{t.noDatasetsAddedInRelease}</Empty>
                    : (
                        <ul className="space-y-1 text-sm">
                          {version.addedDatasetLabels.map((label) => (
                            <li key={label} className="break-all">
                              <Link to={href(locale, datasetPath(label))}>{label}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
                </KeyValue>
                <KeyValue title={t.releaseNote}>
                  <Value field={version.releaseNote} locale={locale} />
                </KeyValue>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  )
}
