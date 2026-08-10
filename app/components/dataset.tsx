import { Link } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, researchPath } from "~/public/urls"
import type { DatasetView } from "~/public/view.server"

import { Downloads } from "./files"
import {
  AccessTypeBadge,
  Annotation,
  Card,
  Empty,
  KeyValue,
  Page,
  PageHead,
  Section,
  UntranslatedNotice,
  Value,
} from "./page"

/**
 * A dataset as it is described now. There is no version here and no history:
 * the archived data does not change, only the description of it does, so every
 * research version that lists this dataset shows this same page.
 */
export function DatasetPage({ view, locale }: { view: DatasetView, locale: Locale }) {
  return (
    <Page>
      <PageHead label={view.label} />
      <Card>
        <DatasetBody
          view={view}
          locale={locale}
          researchHref={href(locale, researchPath(view.humLabel))}
        />
      </Card>
    </Page>
  )
}

/**
 * Everything a dataset says, drawn the same way for the published page and for
 * a preview. The access type and the type of data are placed rather than listed
 * — they are what a reader looks for first, and the access type decides whether
 * the data can be had at all. Everything an experiment carries comes out in
 * catalog order, under catalog labels.
 *
 * The two keys placed here are still anchored under the value slots they come
 * from, so a comment about the access type is a comment about that slot however
 * the page chose to draw it.
 */
export function DatasetBody({ view, locale, researchHref, accessAnchor, typeOfDataAnchor }: {
  view: DatasetView
  locale: Locale
  researchHref: string
  /** Where the two placed values are anchored, when the catalog knows the keys. */
  accessAnchor?: string | null
  typeOfDataAnchor?: string | null
}) {
  const messages = messagesFor(locale)
  const t = messages.dataset

  return (
    <>
      <UntranslatedNotice show={view.untranslated} locale={locale} />

      <dl className="sm:columns-2">
        <KeyValue title={t.datePublished}>{view.datePublished}</KeyValue>
        <KeyValue title={t.dateModified}>{view.dateModified}</KeyValue>
        <KeyValue title={t.research}>
          <Link to={researchHref}>{view.humLabel}</Link>
        </KeyValue>
        {view.typeOfData !== null && (
          <KeyValue title={t.typeOfData} at={typeOfDataAnchor ?? undefined}>
            <Value field={view.typeOfData} locale={locale} />
          </KeyValue>
        )}
        {view.accessType !== null && (
          <KeyValue title={t.accessType} at={accessAnchor ?? undefined}>
            <AccessTypeBadge term={view.accessType} />
          </KeyValue>
        )}
      </dl>

      {view.files.length > 0 && (
        <Section title={t.files}>
          <Downloads
            locale={locale}
            humLabel={view.humLabel === "" ? null : view.humLabel}
            rows={view.files}
            total={view.files.length}
            page={1}
            pageCount={1}
            at={(to) => `?files=${to}`}
          />
        </Section>
      )}

      <Section title={t.experiments} at="experiments">
        {view.experiments.length === 0
          ? <Empty>{t.noExperiments}</Empty>
          : (
              <div className="space-y-6">
                {view.experiments.map((experiment) => (
                  <section key={experiment.id} className="rounded border border-line">
                    <h3 className="bg-surface px-4 py-2 font-semibold">
                      <Value field={experiment.label} locale={locale} />
                    </h3>
                    <div className="px-4 pt-2">
                      <Annotation at={`experiments.${experiment.id}.label`} />
                    </div>
                    <dl className="px-4 py-3 sm:columns-2">
                      {experiment.values.map((value) => (
                        <KeyValue
                          key={value.keyId}
                          title={value.label}
                          at={`experiments.${experiment.id}.values.${value.keyId}`}
                        >
                          <Value field={value.field} locale={locale} />
                        </KeyValue>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            )}
      </Section>
    </>
  )
}
