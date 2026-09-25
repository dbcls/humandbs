import { Link } from "react-router"

import { Badge, Clamped, Excerpt, Stack } from "~/components/base"
import { CartColumnHead, CartToggle } from "~/components/cart"
import { Icon } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { toPlainText } from "~/content/richtext"
import {
  datasetPath,
  fileListQuery,
  href,
  listPath,
  researchFileListPath,
  researchPath,
  researchVersionsPath,
} from "~/public/urls"
import type { DatasetRowView, FieldView, ResearchListRowView, ResearchView, TermView } from "~/public/view.server"

import { Downloads } from "./files"
import {
  AccessTypeBadge,
  Card,
  Crumbs,
  DatasetIds,
  Empty,
  ExternalLink,
  hasLinks,
  IdWithIcon,
  KeyValue,
  LinksValue,
  Page,
  PageHeader,
  Pairs,
  AnnotatedCell,
  Section,
  Table,
  Td,
  TermLabel,
  UntranslatedNotice,
  Value,
} from "./page"

const SHOWN_PLATFORMS = 3

/** The access type whose data needs no application to use. */
const UNRESTRICTED_ACCESS = "unrestricted-access"

/**
 * The published view of one version of a research. `/research/{humId}` and
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
        The header bar names the version and has the two things a reader does from
        here: read the releases, or leave a past version for the current one.
        The label above the number shows what kind of identifier it is, which is
        how v1 sets "NBDC Research ID:" over it.
      */}
      <PageHeader
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
              <Badge onHeaderBar pill>{t.releaseInfo}</Badge>
            </Link>
          </>
        )}
      >
        {/*
          Whether this is the newest version, and the way to the newest one if
          it is not. The two are drawn the same way — a badge on the header bar —
          because they answer the same question; the one that leads somewhere
          is the rounded one, which is the shape v1 gives a badge that is a link.
        */}
        {view.isLatest
          ? <Badge onHeaderBar>{t.latestVersion}</Badge>
          : (
              <Link to={href(locale, researchPath(view.humLabel))}>
                <Badge onHeaderBar pill>
                  {`${t.toLatestVersion} (v${view.latestVersionNumber})`}
                </Badge>
              </Link>
            )}
      </PageHeader>

      <Card><ResearchBody view={view} locale={locale} cart urlList={researchFileListPath(view.humLabel)} /></Card>
    </Page>
  )
}

/**
 * Everything a version shows, and the whole of what a preview shows as well.
 *
 * The two differ in what surrounds it — a preview is not a version yet, so it
 * has no version badge and no release list to point at — and in whether the
 * indicators are there. They come from the annotation layer rather than from a
 * prop, so this reads the same either way and a published page cannot
 * accidentally draw one.
 *
 * `datasetHref` exists because a draft's datasets may have no id pinned yet:
 * a preview addresses them by identity, the public page by label.
 */
export function ResearchBody({ view, locale, datasetHref, releaseNote = false, cart = false, writtenOnly = false, urlList }: {
  view: ResearchView
  locale: Locale
  datasetHref?: (ref: { id: string | null, label: string }) => string | null
  /**
   * Whether to draw only what the research's own form writes. The editing
   * pane does: the dataset table, the downloads and the controlled-access
   * users have no field beside them — the datasets are decided on their own
   * screen, the prefix is the research's, the users come from upstream — and a
   * pane that draws them shows the writer places nothing they type reaches.
   * The page and the share preview draw everything.
   */
  writtenOnly?: boolean
  /**
   * Whether the dataset table has the cart toggles. The published page does;
   * a preview does not, because nothing under a share link can be applied for
   * yet — the labels may not even be pinned.
   */
  cart?: boolean
  /**
   * Whether to draw what this version records that it changed. A published page does
   * not: the note belongs to the release list, where the versions can be read
   * against each other. A preview has no release list, and the note is part of
   * what the provider is being asked to check.
   */
  releaseNote?: boolean
  /**
   * Where the addresses of the research's public files are listed. The
   * published page has one; a preview's files are not public yet.
   */
  urlList?: string
}) {
  const messages = messagesFor(locale)
  const t = messages.research
  const linkTo = (ref: { id: string | null, label: string }): string | null =>
    datasetHref === undefined ? href(locale, datasetPath(ref.label)) : datasetHref(ref)

  return (
    <Stack gap="block">
      <UntranslatedNotice show={view.untranslated} locale={locale} />

      <Section title={t.title} at="title">
        {/* Neither larger nor heavier than the body. The heading above it shows
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
          <KeyValue title={t.aims} at="summary.aims" split={runsLong(view.summary.aims)}>
            <Value field={view.summary.aims} locale={locale} />
          </KeyValue>
          <KeyValue title={t.methods} at="summary.methods" split={runsLong(view.summary.methods)}>
            <Value field={view.summary.methods} locale={locale} />
          </KeyValue>
          <KeyValue title={t.targets} at="summary.targets" split={runsLong(view.summary.targets)}>
            <Value field={view.summary.targets} locale={locale} />
          </KeyValue>
          {hasLinks(view.summary.links) && (
            <KeyValue title={t.url} at="summary.url">
              <LinksValue links={view.summary.links} locale={locale} />
            </KeyValue>
          )}
        </Pairs>
      </Section>

      {!writtenOnly && (
        <Section title={t.datasets} at="datasetIds">
          <Stack gap="tight">
            {!view.isLatest && (
              <p className="text-ink-muted text-sm">{t.datasetsAreCurrent}</p>
            )}
            {view.datasets.length === 0
              ? <Empty>{t.noDatasets}</Empty>
              : (
                  <Table headers={[
                    ...(cart ? [<CartColumnHead key="cart" locale={locale} />] : []),
                    ...datasetColumns(locale),
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
                            <Td holds="icon"><CartToggle ids={[row.label]} locale={locale} /></Td>
                          )}
                          <DatasetCells row={row} name={name} to={to} locale={locale} />
                        </tr>
                      )
                    })}
                  </Table>
                )}
          </Stack>
        </Section>
      )}

      {!writtenOnly && view.files.total > 0 && (
        <Section title={t.downloads}>
          <Downloads
            locale={locale}
            humLabel={view.humLabel === "" ? null : view.humLabel}
            rows={view.files.rows}
            total={view.files.total}
            rangeFrom={view.files.rangeFrom}
            rangeTo={view.files.rangeTo}
            page={view.files.page}
            pageCount={view.files.pageCount}
            size={view.files.size}
            // Only the query string changes, so the same links work from the
            // published address and from a preview without either being named.
            at={fileListQuery}
            urlList={urlList}
            // The datasets are named and led to the way the dataset table above
            // names them — a preview's dataset with no label yet is the same
            // "データセット ID N" in both — and a file none selects has an
            // empty cell.
            selectedBy={(file) => {
              const items = file.datasets.flatMap((at) => {
                const row = view.datasets[at]
                if (row === undefined) return []
                return [{ label: row.label === "" ? `${messages.dataset.datasetId} ${at + 1}` : row.label, to: linkTo(row) }]
              })
              return items.length === 0 ? null : <DatasetIds locale={locale} items={items} />
            }}
          />
        </Section>
      )}

      <Section title={t.dataProvider} at="dataProviders">
        {view.dataProviders.length === 0 && <Empty>{t.noDataProviders}</Empty>}
        {view.dataProviders.map((provider) => (
          <Pairs key={provider.id}>
            <KeyValue title={t.principalInvestigator} at={`dataProviders.${provider.id}.name`}>
              <Value field={provider.principalInvestigator} locale={locale} />
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

      <Section title={t.researchProjects} at="researchProjects">
        {view.researchProjects.length === 0
          ? <Empty>{t.noResearchProjects}</Empty>
          : (
              <Table headers={[t.researchProjectName, t.url]}>
                {view.researchProjects.map((project) => (
                  <tr key={project.id}>
                    <Td>
                      <AnnotatedCell at={`researchProjects.${project.id}.name`} name={t.researchProjectName}>
                        <Value field={project.name} locale={locale} />
                      </AnnotatedCell>
                    </Td>
                    <Td className="break-all">
                      <AnnotatedCell at={`researchProjects.${project.id}.url`} name={t.url}>
                        <LinksValue links={project.links} locale={locale} />
                      </AnnotatedCell>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
      </Section>

      <Section title={t.grants} at="grants">
        {/* The funder names the programme, the programme names the project,
            and the number identifies it — read the other way round a reader
            meets an identifier before anything that says what it belongs to. */}
        {view.grants.length === 0
          ? <Empty>{t.noGrants}</Empty>
          : (
              <Table headers={[t.grantAgency, t.grantTitle, t.grantId]}>
                {view.grants.map((grant) => (
                  <tr key={grant.id}>
                    <Td>
                      <AnnotatedCell at={`grants.${grant.id}.agency.name`} name={t.grantAgency}>
                        <Value field={grant.agency} locale={locale} />
                      </AnnotatedCell>
                    </Td>
                    <Td>
                      <AnnotatedCell at={`grants.${grant.id}.title`} name={t.grantTitle}>
                        <Value field={grant.title} locale={locale} />
                      </AnnotatedCell>
                    </Td>
                    <Td>
                      {/* A line each, because a grant with several numbers runs
                      them into one long code on a single line. */}
                      <AnnotatedCell at={`grants.${grant.id}.grantIds`} name={t.grantId}>
                        <ul className="flex flex-col items-start gap-1">
                          {grant.grantIds.map((grantId) => (
                            <li key={grantId}><Badge pill>{grantId}</Badge></li>
                          ))}
                        </ul>
                      </AnnotatedCell>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
      </Section>

      <Section title={t.relatedPublications} at="relatedPublications">
        {view.relatedPublications.length === 0
          ? <Empty>{t.noRelatedPublications}</Empty>
          : (
              <Table headers={[t.publicationTitle, "DOI", messages.dataset.datasetId]}>
                {view.relatedPublications.map((publication) => (
                  <tr key={publication.id}>
                    <Td>
                      <AnnotatedCell at={`relatedPublications.${publication.id}.title`} name={t.publicationTitle}>
                        <Value field={publication.title} locale={locale} />
                      </AnnotatedCell>
                    </Td>
                    <Td className="break-all">
                      <AnnotatedCell at={`relatedPublications.${publication.id}.doi`} name="DOI">
                        {publication.doi.state === "plain" && publication.doi.text !== ""
                          ? (
                              <ExternalLink to={publication.doi.text} locale={locale}>
                                {publication.doi.text}
                              </ExternalLink>
                            )
                          : <Value field={publication.doi} locale={locale} />}
                      </AnnotatedCell>
                    </Td>
                    <Td>
                      <AnnotatedCell at={`relatedPublications.${publication.id}.datasetIds`} name={messages.dataset.datasetId}>
                        {/* **Another research's dataset has that research's ID
                            after it**: the ID alone reads as one of this
                            research's. **An ID the portal publishes nothing under
                            is written as it was typed**, with nothing to press. */}
                        <DatasetIds
                          locale={locale}
                          items={publication.datasets.map((one) => ({
                            label: one.label,
                            to: one.known ? linkTo({ id: null, label: one.label }) : null,
                            research: one.humLabel === null
                              ? null
                              : { label: one.humLabel, to: href(locale, researchPath(one.humLabel)) },
                          }))}
                        />
                      </AnnotatedCell>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
      </Section>

      {/*
        Drawn even with nothing in it, like the provider, project, grant and
        publication sections: an empty list shows that nobody has been granted
        this data yet, which a page without the section cannot.

        Left out of a version with no controlled data — no datasets, or every
        one unrestricted. Unrestricted data needs no application, so nobody is
        ever listed here. A dataset with no access type counts as controlled:
        nothing shows that it needs no application.
      */}
      {!writtenOnly && view.datasets.some((row) => row.accessType?.code !== UNRESTRICTED_ACCESS) && (
        <Section title={t.controlledAccessUsers}>
          {view.cau.length === 0
            ? <Empty>{t.noControlledAccessUsers}</Empty>
            : (
                <Table headers={[
                  t.principalInvestigator,
                  t.organization,
                  t.country,
                  t.title,
                  t.periodOfDataUse,
                  messages.dataset.datasetId,
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
                        {/* Every accession is the address of its dataset page;
                            under a preview `linkTo` answers null, since a draft
                            has no page to send anyone to. */}
                        <DatasetIds
                          locale={locale}
                          items={usage.datasetAccessions.map((label) => ({ label, to: linkTo({ id: null, label }) }))}
                        />
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
        </Section>
      )}
    </Stack>
  )
}

/** The names over `DatasetCells`, in its order. */
export function datasetColumns(locale: Locale): string[] {
  const messages = messagesFor(locale)
  return [
    messages.dataset.datasetId,
    messages.dataset.typeOfData,
    messages.dataset.accessType,
    messages.dataset.datePublished,
  ]
}

/**
 * One dataset's cells in a research's dataset table: its id, what kind of data
 * it is, how it is accessed, and when it was published.
 *
 * **The management screen that orders a draft's datasets draws the same cells**,
 * so the table a curator arranges reads as the table the page will show — the
 * one difference is where the id leads.
 */
export function DatasetCells({ row, name, to, newTab = false, locale }: {
  row: DatasetRowView
  /** What the id cell shows: the label, or a stand-in where none is pinned. */
  name: string
  /** Where the id leads; null draws it as text. */
  to: string | null
  /** Whether the id opens its page in a new tab, for a screen someone is working on. */
  newTab?: boolean
  locale: Locale
}) {
  return (
    <>
      <Td nowrap>
        {newTab && to !== null
          ? <IdWithIcon kind="dataset"><ExternalLink to={to} locale={locale}>{name}</ExternalLink></IdWithIcon>
          : <IdWithIcon kind="dataset" to={to}>{name}</IdWithIcon>}
      </Td>
      <Td>
        {row.typeOfData !== null && <Value field={row.typeOfData} locale={locale} />}
      </Td>
      <Td>{row.accessType !== null && <AccessTypeBadge term={row.accessType} />}</Td>
      <Td>{row.datePublished}</Td>
    </>
  )
}

/**
 * How long a summary value has to be before it may run on into the next
 * column: about ten lines of the wide column, fourteen of the narrow one.
 * Shorter, and splitting it saves a line or two while leaving one or two lines
 * of it stranded at the head of the other column.
 */
const SPLIT_FROM = 400

export function runsLong(field: FieldView): boolean {
  if (field.state === "plain") return field.text.length >= SPLIT_FROM
  if (field.state === "rich") return toPlainText(field.text).length >= SPLIT_FROM
  return false
}

/**
 * Rows of the research listing, as a table.
 *
 * **The columns are the ones v1 shows**, which is more than a window holds: the
 * table scrolls sideways and the columns that say which row it is stay put
 * (`components/page.tsx`). **Three of them hold what the datasets beneath a
 * study have** rather than anything the study states about itself — the analysis
 * methods, the platforms and who took part — which is why they are named for
 * the values and not for the sections of the research's own page.
 *
 * **A preview draws the same row with nothing to press.** The draft beside the
 * form has no page of its own to send anyone to and no datasets in the cart,
 * so the identifiers stay as text and the cart's column is not drawn — the
 * cells a curator is checking stand exactly where a reader will find them.
 */
export function ResearchListTable({ rows, locale, preview = false, whenEmpty }: {
  rows: readonly ResearchListRowView[]
  locale: Locale
  preview?: boolean
  whenEmpty: string
}) {
  const messages = messagesFor(locale)
  const t = messages.research
  const short = t.listingSummary
  const headers = [
    ...(preview ? [] : [<CartColumnHead key="cart" locale={locale} />]),
    t.researchId,
    t.datasets,
    t.title,
    short.methods,
    short.typeOfData,
    t.platforms,
    short.targets,
    messages.dataset.accessType,
    t.dataProvider,
    messages.dataset.datePublished,
    messages.dataset.dateModified,
  ]
  const id = preview ? 0 : 1
  return (
    <Table headers={headers} stuck={id + 1} whenEmpty={whenEmpty}>
      {rows.map((row) => (
        <tr key={row.humLabel}>
          {!preview && (
            <Td stuck={0} holds="icon"><CartToggle ids={row.datasetLabels} locale={locale} /></Td>
          )}
          <Td stuck={id} nowrap floor="min-w-26">
            <IdWithIcon kind="research" to={preview ? null : href(locale, researchPath(row.humLabel))}>{row.humLabel}</IdWithIcon>
          </Td>
          <Td floor="min-w-40">
            <DatasetIds
              locale={locale}
              items={row.datasetLabels.map((label) => ({ label, to: preview ? null : href(locale, datasetPath(label)) }))}
            />
          </Td>
          <Td floor="min-w-72">
            <Prose messages={messages}><Value field={row.title} locale={locale} /></Prose>
          </Td>
          <Td floor="min-w-40">
            <Prose messages={messages}><Value field={row.methods} locale={locale} /></Prose>
          </Td>
          <Td floor="min-w-56">
            <Prose messages={messages}><Value field={row.typeOfData} locale={locale} /></Prose>
          </Td>
          <Td floor="min-w-40">
            <Platforms terms={row.platforms} locale={locale} />
          </Td>
          <Td floor="min-w-56">
            <Prose messages={messages}><Value field={row.targets} locale={locale} /></Prose>
          </Td>
          <Td>
            <ul>
              {row.accessTypes.map((term) => (
                <li key={term.code}><AccessTypeBadge term={term} /></li>
              ))}
            </ul>
          </Td>
          <Td>
            <ul>
              {row.dataProviders.map((provider, at) => (
                <li key={at}><Value field={provider} locale={locale} /></li>
              ))}
            </ul>
          </Td>
          <Td nowrap floor="min-w-24">{row.datePublished}</Td>
          <Td nowrap floor="min-w-24">{row.dateModified}</Td>
        </tr>
      ))}
    </Table>
  )
}

/**
 * A cell of prose, cut where the row would otherwise grow. The listing's own
 * name for `Excerpt`, so that the four columns drawn this way name the part
 * once and read the same. Not `Clamped`, which truncates a list of items.
 */
function Prose({ messages, children }: {
  messages: ReturnType<typeof messagesFor>
  children: React.ReactNode
}) {
  return (
    <Excerpt more={messages.search.readMore} less={messages.search.showLess}>
      {children}
    </Excerpt>
  )
}

/**
 * What the datasets beneath a study were run on. A study of any size collects
 * these — one of them names twenty-five — so the cell counts the rest instead
 * of opening with them.
 */
function Platforms({ terms, locale }: { terms: TermView[], locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <Clamped
      shown={SHOWN_PLATFORMS}
      more={(rest) => messages.search.andMore(rest)}
      less={messages.search.showLess}
      items={terms.map((term) => <TermLabel key={term.code} term={term} />)}
    />
  )
}
