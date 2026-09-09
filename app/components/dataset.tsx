import { Link } from "react-router"

import { Band, Stack } from "~/components/base"
import { AddToCartButton } from "~/components/cart"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, jgaStudyUrl, listPath, researchPath } from "~/public/urls"
import type { DatasetView } from "~/public/view.server"

import { Downloads } from "./files"
import {
  AccessTypeBadge,
  Annotation,
  Card,
  Crumbs,
  Empty,
  ExternalLink,
  KeyValue,
  Page,
  PageHead,
  Pairs,
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
  const messages = messagesFor(locale)

  return (
    <Page>
      <Crumbs
        locale={locale}
        trail={[{ label: messages.search.datasetList, to: href(locale, listPath("dataset")) }]}
        current={view.label}
      />
      <PageHead
        kicker={messages.dataset.datasetId}
        label={(
          <>
            <Icon name="database" aria-hidden="true" />
            {view.label}
          </>
        )}
      >
        <AddToCartButton datasetLabel={view.label} locale={locale} />
      </PageHead>
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
    <Stack gap="block">
      <UntranslatedNotice show={view.untranslated} locale={locale} />

      {/*
        **The order is the reader's questions, and `Pairs` cuts it into two
        columns from the top.** What the data is and whether it can be used are
        what somebody opening this page came for, so they take the left column;
        where it belongs and when it appeared follow on the right. Dates first
        would spend the corner the eye lands on.
      */}
      <Pairs>
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
        <KeyValue title={t.research}>
          {/* The same mark the two listings put before a research id, so the
              thing being pointed at is recognised before the label is read. */}
          <Icon name="book" aria-hidden="true" className="mr-1 text-ink-muted" />
          <Link to={researchHref}>{view.humLabel}</Link>
        </KeyValue>
        {/* A date the upstream archive has not given us is left out rather
            than drawn as an empty row: "there is no value" and "the label is
            here but the value is missing" read the same and only one is true. */}
        {view.datePublished !== null && (
          <KeyValue title={t.datePublished}>{view.datePublished}</KeyValue>
        )}
        {view.dateModified !== null && (
          <KeyValue title={t.dateModified}>{view.dateModified}</KeyValue>
        )}
        {/*
          **Last, because it is the one that may not be there.** Two datasets in
          three have a study; a slot that comes and goes from the middle would
          move everything under it as the reader moves between them.
        */}
        {view.studyAccession !== null && (
          <KeyValue title={t.jgaStudy}>
            <ExternalLink to={jgaStudyUrl(view.studyAccession)} locale={locale}>
              {view.studyAccession}
            </ExternalLink>
          </KeyValue>
        )}
      </Pairs>

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
              <Stack gap="block">
                {view.experiments.map((experiment) => (
                  <section key={experiment.id} className="rounded border border-line">
                    <Band className="rounded-t">
                      <h3 className="font-semibold">
                        <Value field={experiment.label} locale={locale} />
                      </h3>
                    </Band>
                    <div className="px-4 py-3">
                      <Annotation at={`experiments.${experiment.id}.label`} />
                      <Pairs>
                        {experiment.values.map((value) => (
                          <KeyValue
                            key={value.keyId}
                            title={value.label}
                            at={`experiments.${experiment.id}.values.${value.keyId}`}
                          >
                            <Value field={value.field} locale={locale} />
                          </KeyValue>
                        ))}
                      </Pairs>
                    </div>
                  </section>
                ))}
              </Stack>
            )}
      </Section>
    </Stack>
  )
}
