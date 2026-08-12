import { Link } from "react-router"

import { Badge, Band } from "~/components/base"
import { Icon } from "~/components/icons"
import {
  Card,
  Crumbs,
  Empty,
  KeyValue,
  Page,
  PageHead,
  UntranslatedNotice,
  Value,
} from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { releaseListPage } from "~/public/pages.server"
import {
  datasetPath,
  href,
  listPath,
  readLocale,
  researchPath,
  researchVersionPath,
} from "~/public/urls"

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
      <Crumbs
        locale={locale}
        trail={[
          { label: messages.search.researchList, to: href(locale, listPath("research")) },
          { label: view.humLabel, to: href(locale, researchPath(view.humLabel)) },
        ]}
        current={t.releaseInfo}
      />
      <PageHead
        kicker={t.researchId}
        label={(
          <>
            <Icon name="book" aria-hidden="true" />
            {view.humLabel}
          </>
        )}
      >
        <Badge onBand>{t.releaseInfo}</Badge>
      </PageHead>
      <Card>
        <UntranslatedNotice show={view.untranslated} locale={locale} />
        <ul className="space-y-6">
          {view.versions.map((version) => (
            <li key={version.number} className="overflow-hidden rounded border border-line">
              {/* The versions are what this page is a list of, so each one is
                  named on a band: a grey strip is the weakest thing on a page
                  whose whole job is to separate them. */}
              <Band>
                <h2 className="font-bold">
                  <Link
                    to={href(locale, researchVersionPath(view.humLabel, version.number))}
                    className="text-white visited:text-white"
                  >
                    {version.label}
                  </Link>
                </h2>
                <span className="text-sm">{version.releaseDate}</span>
              </Band>
              <div className="grid gap-6 bg-white px-4 py-4 sm:grid-cols-[18rem_1fr]">
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
