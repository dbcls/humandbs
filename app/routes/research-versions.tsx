import { Link } from "react-router"

import { Band, Stack } from "~/components/base"
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
  const t = messagesFor(loaderData.locale).research
  return [{ title: `${t.releaseInfoOf(loaderData.view.humLabel)} - NBDC Human Database` }]
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
      {/*
        The band names the page rather than the research. A label of the bare
        identifier is the one the version page carries as well, so the two open
        the same way and only the trail says which is which — and the badge that
        made up the difference said, on the right of the band, a word the trail
        had already said on the left.
      */}
      <PageHead
        label={(
          <>
            <Icon name="book" aria-hidden="true" />
            {t.releaseInfoOf(view.humLabel)}
          </>
        )}
      />
      <Card>
        <Stack gap="block">
          <UntranslatedNotice show={view.untranslated} locale={locale} />
          <Stack gap="normal" as="ul">
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
                <div className="grid gap-x-8 bg-white px-4 py-2 sm:grid-cols-[18rem_1fr]">
                  <KeyValue title={t.datasetsAddedInRelease}>
                    {version.addedDatasetLabels.length === 0
                      ? <Empty>{t.noDatasetsAddedInRelease}</Empty>
                      : (
                          <Stack gap="tight" as="ul">
                            {version.addedDatasetLabels.map((label) => (
                              <li key={label} className="break-all text-sm">
                                <Link to={href(locale, datasetPath(label))}>{label}</Link>
                              </li>
                            ))}
                          </Stack>
                        )}
                  </KeyValue>
                  <KeyValue title={t.releaseNote}>
                    <Value field={version.releaseNote} locale={locale} />
                  </KeyValue>
                </div>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>
    </Page>
  )
}
