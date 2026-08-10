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

import {
  AccessTypeBadge,
  Card,
  Empty,
  KeyValue,
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
  const messages = messagesFor(locale)
  const t = messages.research

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

      <Card>
        <UntranslatedNotice show={view.untranslated} locale={locale} />

        <Section title={t.title}>
          <p className="font-semibold text-lg"><Value field={view.title} locale={locale} /></p>
        </Section>

        <Section title={t.overview}>
          <dl className="sm:columns-2">
            <KeyValue title={t.aims}><Value field={view.summary.aims} locale={locale} /></KeyValue>
            <KeyValue title={t.methods}><Value field={view.summary.methods} locale={locale} /></KeyValue>
            <KeyValue title={t.targets}><Value field={view.summary.targets} locale={locale} /></KeyValue>
            {view.summary.links.length > 0 && (
              <KeyValue title={t.url}>
                <ul>
                  {view.summary.links.map((link) => (
                    <li key={link.id} className="break-all">
                      <a href={link.url} target="_blank" rel="noreferrer">{link.text}</a>
                    </li>
                  ))}
                </ul>
              </KeyValue>
            )}
          </dl>
        </Section>

        <Section title={t.datasets}>
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
                  {view.datasets.map((row) => (
                    <tr key={row.label} id={row.label}>
                      <Td className="break-all">
                        <Link to={href(locale, datasetPath(row.label))}>{row.label}</Link>
                      </Td>
                      <Td>{row.accessType !== null && <AccessTypeBadge term={row.accessType} />}</Td>
                      <Td>{row.typeOfData !== null && <Value field={row.typeOfData} locale={locale} />}</Td>
                      <Td>{row.datePublished}</Td>
                    </tr>
                  ))}
                </Table>
              )}
        </Section>

        {view.dataProviders.length > 0 && (
          <Section title={t.dataProvider}>
            {view.dataProviders.map((provider) => (
              <dl key={provider.id} className="sm:columns-2">
                <KeyValue title={t.representative}>
                  <Value field={provider.representative} locale={locale} />
                </KeyValue>
                <KeyValue title={t.organization}>
                  <Value field={provider.organization} locale={locale} />
                </KeyValue>
              </dl>
            ))}
          </Section>
        )}

        {view.researchProjects.length > 0 && (
          <Section title={t.researchProjects}>
            <Table headers={[t.researchProjectName, t.url]}>
              {view.researchProjects.map((project) => (
                <tr key={project.id}>
                  <Td><Value field={project.name} locale={locale} /></Td>
                  <Td className="break-all">
                    <ul>
                      {project.links.map((link) => (
                        <li key={link.id}>
                          <a href={link.url} target="_blank" rel="noreferrer">{link.text}</a>
                        </li>
                      ))}
                    </ul>
                  </Td>
                </tr>
              ))}
            </Table>
          </Section>
        )}

        {view.grants.length > 0 && (
          <Section title={t.grants}>
            <Table headers={[t.grantTitle, t.grantAgency, t.grantId]}>
              {view.grants.map((grant) => (
                <tr key={grant.id}>
                  <Td><Value field={grant.title} locale={locale} /></Td>
                  <Td><Value field={grant.agency} locale={locale} /></Td>
                  <Td>{grant.grantIds.join(", ")}</Td>
                </tr>
              ))}
            </Table>
          </Section>
        )}

        {view.relatedPublications.length > 0 && (
          <Section title={t.relatedPublications}>
            <Table headers={[t.publicationTitle, "DOI", messages.dataset.datasets]}>
              {view.relatedPublications.map((publication) => (
                <tr key={publication.id}>
                  <Td>{publication.title}</Td>
                  <Td className="break-all">
                    {publication.doi !== "" && (
                      <a href={publication.doi} target="_blank" rel="noreferrer">{publication.doi}</a>
                    )}
                  </Td>
                  <Td>
                    <ul>
                      {publication.datasetLabels.map((label) => (
                        <li key={label} className="break-all">
                          <Link to={href(locale, datasetPath(label))}>{label}</Link>
                        </li>
                      ))}
                    </ul>
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
              {view.cau.map((usage) => (
                <tr key={usage.applicationId}>
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
      </Card>
    </Page>
  )
}
