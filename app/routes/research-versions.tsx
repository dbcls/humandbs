import { Link } from "react-router"

import { Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import {
  HeaderBarSection,
  Card,
  Crumbs,
  Empty,
  IdWithIcon,
  KeyValue,
  Page,
  PageHeader,
  UntranslatedNotice,
  Value,
} from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
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
  const messages = messagesFor(loaderData.locale)
  const steps = [messages.research.releaseInfo, loaderData.view.humLabel, messages.search.researchList]
  return [{ title: windowTitle(messages, steps) }]
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
        The header bar names the page rather than the research. A label of the bare
        identifier is the one the version page has as well, so the two open
        the same way and only the trail shows which is which — and the badge that
        made up the difference said, on the right of the header bar, a word the trail
        had already said on the left.
      */}
      <PageHeader
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
              <HeaderBarSection
                key={version.number}
                as="li"
                level={2}
                title={(
                  <Link
                    to={href(locale, researchVersionPath(view.humLabel, version.number))}
                    className="text-white visited:text-white"
                  >
                    {version.label}
                  </Link>
                )}
                aside={<span className="text-sm">{version.releaseDate}</span>}
              >
                {/* Two pairs side by side, separated by the space between the columns. */}
                <dl className="grid gap-x-8 sm:grid-cols-[18rem_1fr]">
                  <KeyValue title={t.datasetsAddedInRelease}>
                    {version.addedDatasetLabels.length === 0
                      ? <Empty>{t.noDatasetsAddedInRelease}</Empty>
                      : (
                          <Stack gap="tight" as="ul">
                            {version.addedDatasetLabels.map((label) => (
                              <li key={label} className="whitespace-nowrap text-sm">
                                <IdWithIcon kind="dataset" to={href(locale, datasetPath(label))}>{label}</IdWithIcon>
                              </li>
                            ))}
                          </Stack>
                        )}
                  </KeyValue>
                  <KeyValue title={t.releaseNote}>
                    <Value field={version.releaseNote} locale={locale} />
                  </KeyValue>
                </dl>
              </HeaderBarSection>
            ))}
          </Stack>
        </Stack>
      </Card>
    </Page>
  )
}
