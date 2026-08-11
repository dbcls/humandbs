import { Link } from "react-router"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import {
  datasetPath,
  href,
  researchPath,
  researchVersionsPath,
} from "~/public/urls"
import type { ResearchView } from "~/public/view.server"

import { Downloads } from "./files"
import {
  AccessTypeBadge,
  Annotation,
  Card,
  Empty,
  hasLinks,
  KeyValue,
  LinksValue,
  Page,
  PageHead,
  Section,
  Table,
  Td,
  UntranslatedNotice,
  Value,
} from "./page"

/**
 * The published face of one version of a research. `/research/{humId}` and
 * `/research/{humId}/v{n}` render the same thing — the first is the second with
 * the number left out — so telling them apart on screen is only the badge.
 *
 * Experiments are not here. They belong to a dataset, and the order the old
 * articles put them in cannot be recovered, so a version lists its datasets and
 * each dataset describes its own.
 */
export function ResearchVersionPage({ view, locale }: { view: ResearchView, locale: Locale }) {
  const t = messagesFor(locale).research

  return (
    <Page>
      <PageHead label={view.versionLabel}>
        {view.isLatest
          ? <span className="rounded-sm bg-white/20 px-2 py-0.5">{t.latestVersion}</span>
          : (
              <Link
                to={href(locale, researchPath(view.humLabel))}
                className="text-white visited:text-white"
              >
                {`${t.toLatestVersion} (v${view.latestVersionNumber})`}
              </Link>
            )}
        <Link
          to={href(locale, researchVersionsPath(view.humLabel))}
          className="text-white visited:text-white"
        >
          {t.releaseInfo}
        </Link>
      </PageHead>

      <Card><ResearchBody view={view} locale={locale} /></Card>
    </Page>
  )
}

/**
 * Everything a version says, and the whole of what a preview shows as well.
 *
 * The two differ in what surrounds it — a preview is not a version yet, so it
 * has no version badge and no release list to point at — and in whether the
 * marks are there. The marks come from the annotation layer rather than from a
 * prop, so this reads the same either way and a published page cannot
 * accidentally draw one.
 *
 * `datasetHref` exists because a draft's datasets may have no id pinned yet:
 * a preview addresses them by identity, the public page by label.
 */
export function ResearchBody({ view, locale, datasetHref }: {
  view: ResearchView
  locale: Locale
  datasetHref?: (ref: { id: string | null, label: string }) => string | null
}) {
  const messages = messagesFor(locale)
  const t = messages.research
  const linkTo = (ref: { id: string | null, label: string }): string | null =>
    datasetHref === undefined ? href(locale, datasetPath(ref.label)) : datasetHref(ref)

  return (
    <>
      <UntranslatedNotice show={view.untranslated} locale={locale} />

      <Section title={t.title} at="title">
        <p className="font-semibold text-lg"><Value field={view.title} locale={locale} /></p>
      </Section>

      <Section title={t.overview}>
        <dl className="sm:columns-2">
          <KeyValue title={t.aims} at="summary.aims">
            <Value field={view.summary.aims} locale={locale} />
          </KeyValue>
          <KeyValue title={t.methods} at="summary.methods">
            <Value field={view.summary.methods} locale={locale} />
          </KeyValue>
          <KeyValue title={t.targets} at="summary.targets">
            <Value field={view.summary.targets} locale={locale} />
          </KeyValue>
          {hasLinks(view.summary.links) && (
            <KeyValue title={t.url} at="summary.url">
              <LinksValue links={view.summary.links} locale={locale} />
            </KeyValue>
          )}
        </dl>
      </Section>

      <Section title={t.datasets} at="datasetIds">
        {!view.isLatest && (
          <p className="mb-2 text-ink-muted text-sm">{t.datasetsAreCurrent}</p>
        )}
        {view.datasets.length === 0
          ? <Empty>{t.noDatasets}</Empty>
          : (
              <Table headers={[
                messages.dataset.datasetId,
                messages.dataset.accessType,
                messages.dataset.typeOfData,
                messages.dataset.datePublished,
              ]}
              >
                {view.datasets.map((row, at) => {
                  const name = row.label === ""
                    ? `${messages.dataset.datasetId} ${at + 1}`
                    : row.label
                  const to = linkTo(row)
                  return (
                    <tr key={row.id ?? row.label} id={row.label === "" ? undefined : row.label}>
                      <Td className="break-all">
                        {to === null ? name : <Link to={to}>{name}</Link>}
                      </Td>
                      <Td>{row.accessType !== null && <AccessTypeBadge term={row.accessType} />}</Td>
                      <Td>
                        {row.typeOfData !== null && <Value field={row.typeOfData} locale={locale} />}
                      </Td>
                      <Td>{row.datePublished}</Td>
                    </tr>
                  )
                })}
              </Table>
            )}
      </Section>

      {view.files.total > 0 && (
        <Section title={t.downloads}>
          <Downloads
            locale={locale}
            humLabel={view.humLabel === "" ? null : view.humLabel}
            rows={view.files.rows}
            total={view.files.total}
            page={view.files.page}
            pageCount={view.files.pageCount}
            // Only the query string changes, so the same links work from the
            // published address and from a preview without either being named.
            at={(to) => `?files=${to}`}
          />
        </Section>
      )}

      {view.dataProviders.length > 0 && (
        <Section title={t.dataProvider} at="dataProviders">
          {view.dataProviders.map((provider) => (
            <dl key={provider.id} className="sm:columns-2">
              <KeyValue title={t.representative} at={`dataProviders.${provider.id}.name`}>
                <Value field={provider.representative} locale={locale} />
              </KeyValue>
              <KeyValue
                title={t.organization}
                at={`dataProviders.${provider.id}.organization.name`}
              >
                <Value field={provider.organization} locale={locale} />
              </KeyValue>
            </dl>
          ))}
        </Section>
      )}

      {view.researchProjects.length > 0 && (
        <Section title={t.researchProjects} at="researchProjects">
          <Table headers={[t.researchProjectName, t.url]}>
            {view.researchProjects.map((project) => (
              <tr key={project.id}>
                <Td>
                  <Value field={project.name} locale={locale} />
                  <Annotation at={`researchProjects.${project.id}.name`} />
                </Td>
                <Td className="break-all">
                  <LinksValue links={project.links} locale={locale} />
                  <Annotation at={`researchProjects.${project.id}.url`} />
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {view.grants.length > 0 && (
        <Section title={t.grants} at="grants">
          <Table headers={[t.grantTitle, t.grantAgency, t.grantId]}>
            {view.grants.map((grant) => (
              <tr key={grant.id}>
                <Td>
                  <Value field={grant.title} locale={locale} />
                  <Annotation at={`grants.${grant.id}.title`} />
                </Td>
                <Td>
                  <Value field={grant.agency} locale={locale} />
                  <Annotation at={`grants.${grant.id}.agency.name`} />
                </Td>
                <Td>
                  {grant.grantIds.join(", ")}
                  <Annotation at={`grants.${grant.id}.grantIds`} />
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {view.relatedPublications.length > 0 && (
        <Section title={t.relatedPublications} at="relatedPublications">
          <Table headers={[t.publicationTitle, "DOI", messages.dataset.datasets]}>
            {view.relatedPublications.map((publication) => (
              <tr key={publication.id}>
                <Td>
                  <Value field={publication.title} locale={locale} />
                  <Annotation at={`relatedPublications.${publication.id}.title`} />
                </Td>
                <Td className="break-all">
                  {publication.doi.state === "plain" && publication.doi.text !== ""
                    ? (
                        <a href={publication.doi.text} target="_blank" rel="noreferrer">
                          {publication.doi.text}
                        </a>
                      )
                    : <Value field={publication.doi} locale={locale} />}
                  <Annotation at={`relatedPublications.${publication.id}.doi`} />
                </Td>
                <Td>
                  <ul>
                    {publication.datasetLabels.map((label) => {
                      const to = linkTo({ id: null, label })
                      return (
                        <li key={label} className="break-all">
                          {to === null ? label : <Link to={to}>{label}</Link>}
                        </li>
                      )
                    })}
                  </ul>
                  <Annotation at={`relatedPublications.${publication.id}.datasetIds`} />
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {view.cau.length > 0 && (
        <Section title={t.controlledAccessUsers}>
          <Table headers={[
            t.representative,
            t.organization,
            t.country,
            t.title,
            t.periodOfDataUse,
            messages.dataset.datasets,
          ]}
          >
            {view.cau.map((usage, index) => (
              // No identifier a reader may see reaches this table, and the rows
              // arrive in a fixed order that nothing here reorders.
              <tr key={index}>
                <Td>{usage.principalInvestigator}</Td>
                <Td>{usage.affiliation}</Td>
                <Td>{usage.country}</Td>
                <Td>{usage.researchTitle}</Td>
                <Td className="text-nowrap">
                  {usage.periodStart !== null || usage.periodEnd !== null
                    ? `${usage.periodStart ?? ""} – ${usage.periodEnd ?? ""}`
                    : null}
                </Td>
                <Td>
                  <ul>
                    {usage.datasetAccessions.map((accession) => (
                      <li key={accession} className="break-all">{accession}</li>
                    ))}
                  </ul>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
    </>
  )
}
