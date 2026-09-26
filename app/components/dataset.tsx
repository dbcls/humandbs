import { useSearchParams } from "react-router"

import { Stack } from "~/components/base"
import { AddToCartButton } from "~/components/cart"
import { Icon } from "~/components/icons"
import { filePageOf, fileRowsOf, pageOfFiles } from "~/files/prefix"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { datasetFileListPath, ddbjSearchEntryUrl, fileListQuery, href, jgaEntryUrl, listPath, researchPath } from "~/public/urls"
import type { DatasetView } from "~/public/view.server"

import { Downloads, UrlListLink, type PublicFileUrls } from "./files"
import {
  AccessTypeBadge,
  Annotation,
  HeaderBarSection,
  Card,
  Crumbs,
  Empty,
  ExternalLink,
  IdWithIcon,
  KeyValue,
  Page,
  PageHeader,
  Pairs,
  ValueAtPath,
  Section,
  UntranslatedNotice,
  Value,
} from "./page"

/**
 * A dataset as it is described now. There is no version here and no history:
 * the archived data does not change, only the description of it does, so every
 * research version that lists this dataset shows this same page.
 */
export function DatasetPage({ view, locale, origin }: {
  view: DatasetView
  locale: Locale
  /** The site's public origin, which a file's copied address is written on. */
  origin: string
}) {
  const messages = messagesFor(locale)

  return (
    <Page>
      <Crumbs
        locale={locale}
        trail={[{ label: messages.search.datasetList, to: href(locale, listPath("dataset")) }]}
        current={view.label}
      />
      <PageHeader
        kicker={messages.dataset.datasetId}
        label={(
          <>
            <Icon name="database" aria-hidden="true" />
            {view.label}
          </>
        )}
      >
        <AddToCartButton datasetLabel={view.label} locale={locale} />
      </PageHeader>
      <Card>
        <DatasetBody
          view={view}
          locale={locale}
          researchHref={href(locale, researchPath(view.humLabel))}
          fileUrls={{ list: datasetFileListPath(view.label), origin }}
        />
      </Card>
    </Page>
  )
}

/**
 * Everything a dataset shows, drawn the same way for the published page and for
 * a preview. The access type and the type of data are placed rather than listed
 * — they are what a reader looks for first, and the access type decides whether
 * the data can be had at all. Everything an experiment has comes out in
 * catalog order, under catalog labels.
 *
 * The two keys placed here are still anchored under the value slots they come
 * from, so a comment about the access type is a comment about that slot however
 * the page chose to draw it.
 */
export function DatasetBody({ view, locale, researchHref, accessAnchor, typeOfDataAnchor, fileUrls }: {
  view: DatasetView
  locale: Locale
  researchHref: string
  /** Where the two placed values are anchored, when the catalog knows the keys. */
  accessAnchor?: string | null
  typeOfDataAnchor?: string | null
  /** Where the files the dataset selects are fetched from. The published page has them. */
  fileUrls?: PublicFileUrls
}) {
  const messages = messagesFor(locale)
  const t = messages.dataset
  // The selection is cut here rather than on the server: the view is built by
  // every screen that draws a dataset (the page, the preview, the editor's
  // pane), and the page asked for is only ever the address's. It is the same
  // parameters as the research's download list.
  const [params] = useSearchParams()
  const size = fileRowsOf(params)
  const files = pageOfFiles(view.files, filePageOf(params), size)
  // Where the archive describes the dataset: the registration's details are
  // there, and the portal holds none of them.
  const ddbjSearch = ddbjSearchEntryUrl(view.label)

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
          {/* The same icon the two listings put before a research id, so the
              thing being pointed at is recognised before the label is read. */}
          <IdWithIcon kind="research" to={researchHref}>{view.humLabel}</IdWithIcon>
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
          **Last, because they are the ones that may not be there.** Four
          datasets in five have an entry in DDBJ Search, two in three a study,
          and fewer still an id they were known by before; a slot that comes
          and goes from the middle would move everything under it as the reader
          moves between them.
        */}
        {ddbjSearch !== null && (
          <KeyValue title={t.ddbjSearch}>
            <ExternalLink to={ddbjSearch} locale={locale}>{view.label}</ExternalLink>
          </KeyValue>
        )}
        {view.studyAccession !== null && (
          <KeyValue title={t.jgaStudy}>
            <ExternalLink to={jgaEntryUrl(view.studyAccession)} locale={locale}>
              {view.studyAccession}
            </ExternalLink>
          </KeyValue>
        )}
        {/* The ids an old paper or an old address names, so a reader who came
            by one sees it is this dataset. Not links: each leads here. */}
        {view.secondaryLabels.length > 0 && (
          <KeyValue title={t.secondaryIds}>{view.secondaryLabels.join(", ")}</KeyValue>
        )}
      </Pairs>

      {view.files.length > 0 && (
        <Section title={t.files} end={fileUrls && <UrlListLink locale={locale} to={fileUrls.list} />}>
          <Downloads
            locale={locale}
            humLabel={view.humLabel === "" ? null : view.humLabel}
            rows={files.rows}
            total={files.total}
            rangeFrom={files.rangeFrom}
            rangeTo={files.rangeTo}
            page={files.page}
            pageCount={files.pageCount}
            size={size}
            at={fileListQuery}
            origin={fileUrls?.origin}
          />
        </Section>
      )}

      <Section title={t.experiments} at="experiments">
        {view.experiments.length === 0
          ? <Empty>{t.noExperiments}</Empty>
          : (
              <Stack gap="block">
                {view.experiments.map((experiment) => (
                  <HeaderBarSection
                    key={experiment.id}
                    level={3}
                    title={(
                      <>
                        <ValueAtPath at={`experiments.${experiment.id}.label`} onHeaderBar>
                          <Value field={experiment.label} locale={locale} />
                        </ValueAtPath>
                        <Annotation at={`experiments.${experiment.id}.label`} name={t.experiments} />
                      </>
                    )}
                  >
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
                  </HeaderBarSection>
                ))}
              </Stack>
            )}
      </Section>
    </Stack>
  )
}
