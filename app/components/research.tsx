import { Link } from "react-router"

import { Badge, Clamped, Stack } from "~/components/base"
import { CartToggle } from "~/components/cart"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import {
  datasetPath,
  href,
  listPath,
  researchPath,
  researchVersionsPath,
} from "~/public/urls"
import type { ResearchView } from "~/public/view.server"

import { Downloads } from "./files"
import {
  AccessTypeBadge,
  Annotation,
  Card,
  Crumbs,
  Empty,
  ExternalLink,
  hasLinks,
  KeyValue,
  LinksValue,
  Page,
  PageHead,
  Pairs,
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
 * **The trail is the one thing the two cannot share.** At a numbered address
 * the research itself is a step above rather than where the reader is, and a
 * trail ending in the bare label said they were on a page that is somewhere
 * else and showing a different version.
 *
 * Experiments are not here. They belong to a dataset, and the order the old
 * articles put them in cannot be recovered, so a version lists its datasets and
 * each dataset describes its own.
 */
export function ResearchVersionPage({ view, locale, numbered = false }: {
  view: ResearchView
  locale: Locale
  /** Whether the address names the version (`/research/{humId}/v{n}`). */
  numbered?: boolean
}) {
  const messages = messagesFor(locale)
  const t = messages.research
  const listing = { label: messages.search.researchList, to: href(locale, listPath("research")) }

  return (
    <Page>
      <Crumbs
        locale={locale}
        trail={numbered
          ? [listing, { label: view.humLabel, to: href(locale, researchPath(view.humLabel)) }]
          : [listing]}
        current={numbered ? view.versionLabel : view.humLabel}
      />
      {/*
        The band names the version and carries the two things a reader does from
        here: read the releases, or leave a past version for the current one.
        The label above the number says what kind of identifier it is, which is
        how v1 sets "NBDC Research ID:" over it.
      */}
      <PageHead
        kicker={t.researchId}
        label={(
          <>
            <Icon name="book" aria-hidden="true" />
            {view.versionLabel}
            {/*
              **The link is a flex item, not a line of text.** Left inline it
              draws a line box the height of the heading, and the badge inside
              it lands on that line's baseline rather than on the centre the
              heading is aligning everything else to.
            */}
            <Link
              to={href(locale, researchVersionsPath(view.humLabel))}
              className="flex no-underline"
            >
              <Badge onBand pill>{t.releaseInfo}</Badge>
            </Link>
          </>
        )}
      >
        {/*
          Whether this is the newest version, and the way to the newest one if
          it is not. The two are drawn the same way — a badge on the band —
          because they answer the same question; the one that leads somewhere
          is the rounded one, which is the shape v1 gives a badge that is a link.
        */}
        {view.isLatest
          ? <Badge onBand>{t.latestVersion}</Badge>
          : (
              <Link to={href(locale, researchPath(view.humLabel))}>
                <Badge onBand pill>
                  {`${t.toLatestVersion} (v${view.latestVersionNumber})`}
                </Badge>
              </Link>
            )}
      </PageHead>

      <Card><ResearchBody view={view} locale={locale} cart /></Card>
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
export function ResearchBody({ view, locale, datasetHref, releaseNote = false, cart = false }: {
  view: ResearchView
  locale: Locale
  datasetHref?: (ref: { id: string | null, label: string }) => string | null
  /**
   * Whether the dataset table carries the cart marks. The published page does;
   * a preview does not, because nothing under a share link can be applied for
   * yet — the labels may not even be pinned.
   */
  cart?: boolean
  /**
   * Whether to draw what this version says it changed. A published page does
   * not: the note belongs to the release list, where the versions can be read
   * against each other. A preview has no release list, and the note is part of
   * what the provider is being asked to check.
   */
  releaseNote?: boolean
}) {
  const messages = messagesFor(locale)
  const t = messages.research
  const linkTo = (ref: { id: string | null, label: string }): string | null =>
    datasetHref === undefined ? href(locale, datasetPath(ref.label)) : datasetHref(ref)

  return (
    <Stack gap="block">
      <UntranslatedNotice show={view.untranslated} locale={locale} />

      <Section title={t.title} at="title">
        {/* Neither larger nor heavier than the body. The heading above it says
            what it is, and a title set apart twice — once by its own heading and
            again by its size — is a sentence the page has decided to shout. */}
        <p><Value field={view.title} locale={locale} /></p>
      </Section>

      {releaseNote && (
        <Section title={t.releaseNote} at="releaseNote">
          <Value field={view.releaseNote} locale={locale} />
        </Section>
      )}

      <Section title={t.overview}>
        <Pairs>
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
        </Pairs>
      </Section>

      <Section title={t.datasets} at="datasetIds">
        <Stack gap="tight">
          {!view.isLatest && (
            <p className="text-ink-muted text-sm">{t.datasetsAreCurrent}</p>
          )}
          {view.datasets.length === 0
            ? <Empty>{t.noDatasets}</Empty>
            : (
                <Table headers={[
                  ...(cart
                    ? [
                        <CartToggle
                          key="cart"
                          ids={view.datasets.map((row) => row.label)}
                          locale={locale}
                          whole
                        />,
                      ]
                    : []),
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
                        {cart && (
                          <Td narrow><CartToggle ids={[row.label]} locale={locale} /></Td>
                        )}
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
        </Stack>
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
            <Pairs key={provider.id}>
              <KeyValue title={t.representative} at={`dataProviders.${provider.id}.name`}>
                <Value field={provider.representative} locale={locale} />
              </KeyValue>
              <KeyValue
                title={t.organization}
                at={`dataProviders.${provider.id}.organization.name`}
              >
                <Value field={provider.organization} locale={locale} />
              </KeyValue>
            </Pairs>
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
          {/* The funder names the programme, the programme names the project,
              and the number identifies it — read the other way round a reader
              meets an identifier before anything that says what it belongs to. */}
          <Table headers={[t.grantAgency, t.grantTitle, t.grantId]}>
            {view.grants.map((grant) => (
              <tr key={grant.id}>
                <Td>
                  <Value field={grant.agency} locale={locale} />
                  <Annotation at={`grants.${grant.id}.agency.name`} />
                </Td>
                <Td>
                  <Value field={grant.title} locale={locale} />
                  <Annotation at={`grants.${grant.id}.title`} />
                </Td>
                <Td>
                  {/* A line each, because a grant carrying several numbers runs
                      them into one long code on a single line. */}
                  <ul>
                    {grant.grantIds.map((grantId) => (
                      <li key={grantId}>{grantId}</li>
                    ))}
                  </ul>
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
                        <ExternalLink to={publication.doi.text} locale={locale}>
                          {publication.doi.text}
                        </ExternalLink>
                      )
                    : <Value field={publication.doi} locale={locale} />}
                  <Annotation at={`relatedPublications.${publication.id}.doi`} />
                </Td>
                <Td>
                  <DatasetList
                    labels={publication.datasetLabels}
                    linkTo={linkTo}
                    messages={messages}
                  />
                  <Annotation at={`relatedPublications.${publication.id}.datasetIds`} />
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {/*
        Drawn even with nothing in it. What a research says about itself is
        absent when it has none — a version with no grant simply has no grants
        section — but this reports what has happened since it was published, and
        an empty one is an answer: nobody has been granted this data yet. Left
        out, a reader cannot tell that from a page that forgot to ask.
      */}
      <Section title={t.controlledAccessUsers}>
        {view.cau.length === 0
          ? <Empty>{t.noControlledAccessUsers}</Empty>
          : (
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
                  // No identifier a reader may see reaches this table, and the
                  // rows arrive in a fixed order that nothing here reorders.
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
                      <DatasetList
                        labels={usage.datasetAccessions}
                        linkTo={linkTo}
                        messages={messages}
                      />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
      </Section>
    </Stack>
  )
}

/**
 * The datasets one row of a table names.
 *
 * **Cut to a few with the rest a press away**, the way a listing cuts the same
 * column: one usage record can name sixty-seven accessions, and a row that
 * tall pushes every row under it off the screen — while the reader is reading
 * down a column of who used what, not reading one entry.
 *
 * **Every accession is the address of the dataset page.** A reader who has
 * found the row they wanted is one press from what was used; written as text
 * they would have to carry the identifier to the listing by hand. Under a
 * preview link `linkTo` answers null, which is right — an accession is a
 * published dataset, and a draft has no page to send anyone to.
 */
function DatasetList({ labels, linkTo, messages }: {
  labels: string[]
  linkTo: (ref: { id: string | null, label: string }) => string | null
  messages: ReturnType<typeof messagesFor>
}) {
  return (
    <Clamped
      more={(rest) => messages.search.andMore(rest)}
      less={messages.search.showLess}
      items={labels.map((label) => {
        const to = linkTo({ id: null, label })
        return (
          <span key={label} className="break-all">
            {to === null ? label : <Link to={to}>{label}</Link>}
          </span>
        )
      })}
    />
  )
}
