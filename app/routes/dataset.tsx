import { Link } from "react-router"

import {
  AccessTypeBadge,
  Card,
  Empty,
  KeyValue,
  Page,
  PageHead,
  Section,
  UntranslatedNotice,
  Value,
} from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { datasetPage } from "~/public/pages.server"
import { href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/dataset"

export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return { locale, view: await datasetPage({ locale, datasetId: params.datasetId }) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.view.label} - NBDC Human Database` }]
}

/**
 * A dataset as it is described now. There is no version here and no history:
 * the archived data does not change, only the description of it does, so every
 * research version that lists this dataset shows this same page.
 *
 * The access type and the type of data are placed rather than listed — they are
 * what a reader looks for first, and the access type decides whether the data
 * can be had at all. Everything an experiment carries comes out in catalog
 * order, under catalog labels.
 */
export default function Dataset({ loaderData }: Route.ComponentProps) {
  const { locale, view } = loaderData
  const messages = messagesFor(locale)
  const t = messages.dataset

  return (
    <Page>
      <PageHead label={view.label} />
      <Card>
        <UntranslatedNotice show={view.untranslated} locale={locale} />

        <dl className="sm:columns-2">
          <KeyValue title={t.datePublished}>{view.datePublished}</KeyValue>
          <KeyValue title={t.dateModified}>{view.dateModified}</KeyValue>
          <KeyValue title={t.research}>
            <Link to={href(locale, researchPath(view.humLabel))}>{view.humLabel}</Link>
          </KeyValue>
          {view.typeOfData !== null && (
            <KeyValue title={t.typeOfData}>
              <Value field={view.typeOfData} locale={locale} />
            </KeyValue>
          )}
          {view.accessType !== null && (
            <KeyValue title={t.accessType}><AccessTypeBadge term={view.accessType} /></KeyValue>
          )}
        </dl>

        <Section title={t.experiments}>
          {view.experiments.length === 0
            ? <Empty>{t.noExperiments}</Empty>
            : (
                <div className="space-y-6">
                  {view.experiments.map((experiment) => (
                    <section key={experiment.id} className="rounded border border-line">
                      <h3 className="bg-surface px-4 py-2 font-semibold">{experiment.label}</h3>
                      <dl className="px-4 py-3 sm:columns-2">
                        {experiment.values.map((value) => (
                          <KeyValue key={value.keyId} title={value.label}>
                            <Value field={value.field} locale={locale} />
                          </KeyValue>
                        ))}
                      </dl>
                    </section>
                  ))}
                </div>
              )}
        </Section>
      </Card>
    </Page>
  )
}
