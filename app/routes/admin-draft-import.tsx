import { data, Form } from "react-router"

import { importAction, importPage } from "~/admin/import.server"
import type { UpstreamBranchView } from "~/admin/templates.server"
import { adminDraftPath, adminDraftImportPath, adminUpstreamResearchPath, upstreamQuery } from "~/admin/urls"
import { AdminBack, ScreenLink } from "~/components/admin"
import { ButtonLink, Heading, Note, Stack } from "~/components/base"
import { Answer, Field, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Section, Table, Td } from "~/components/page"
import { ApplicationDatasets, ApplicationWarning, researchParts, sourceName, SourceTable, ImportForm } from "~/components/import"
import { BranchCells, BranchDialog, UpstreamNotConnected } from "~/components/upstream"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"
import { useRefine } from "~/search-as-typed"

import type { Route } from "./+types/admin-draft-import"

/** How many registered datasets a row opens with before it counts the rest. */

/**
 * Importing values into a draft from a version, another draft or an
 * application.
 *
 * **Without a source chosen, this is the table of sources**: the research's
 * versions and drafts in the one table the research's own screen draws them in,
 * and this research's application branches with the box to type an ID that
 * has no hum label yet. Choosing one turns the same screen into the three-row
 * form, whose back link leads to the table.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return importPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await importAction(request, locale, params)
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, loaderData.chosen === null ? messages.admin.import.heading : messages.admin.import.chosenHeading, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftImport({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.import
  const here = adminDraftImportPath(view.researchId, view.draftId)
  const chosen = view.chosen
  const application = chosen?.source.kind === "application" ? chosen.source : null

  return (
    <Page>
      {/* Only a refusal is answered: importing it leaves for the draft. */}
      <Answer
        answer={actionData}
        locale={locale}
        said={(answer) => answer.status === "conflict" ? messages.admin.conflict : messages.admin.templates.takenLabel}
      />
      <Card under={false}>
        <Stack gap="block">
          {chosen === null
            ? (
                <Heading title={t.heading} aside={view.humLabel ?? undefined} note={t.headingNote}>
                  <AdminBack
                    to={href(locale, adminDraftPath(view.researchId, view.draftId))}
                    label={messages.admin.templates.backToDraft}
                    icon="chevron-left"
                  />
                </Heading>
              )
            : (
                // **Once a source is chosen, the name shows what is being done
                // and where from**, and the one back link returns to the choice:
                // leaving for the draft is what importing it does.
                <Heading
                  title={t.chosenHeading}
                  aside={view.humLabel ?? undefined}
                  from={t.chosenFrom(sourceName(chosen.source, locale))}
                >
                  <AdminBack to={href(locale, here)} label={t.backToSources} icon="chevron-left" />
                </Heading>
              )}

          {chosen === null
            ? <Sources view={view} here={here} />
            : (
                <Stack gap="block">
                  <ImportForm
                    // A new source is a new form: what was written against
                    // the last one does not persist.
                    key={JSON.stringify(chosen.source.kind === "application"
                      ? chosen.source.applicationId
                      : chosen.source)}
                    locale={locale}
                    parts={researchParts(locale, chosen.datasets, chosen.citable, [chosen.mine, chosen.theirs])}
                    mine={chosen.mine}
                    theirs={chosen.theirs}
                    sourceLabel={sourceName(chosen.source, locale)}
                    revision={view.revision}
                    hidden={application !== null && (
                      <input type="hidden" name="application" value={application.applicationId} />
                    )}
                    before={application !== null && (
                      <ApplicationWarning locale={locale} source={application} humLabel={view.humLabel} />
                    )}
                    after={application === null ? undefined : <ApplicationDatasets locale={locale} source={application} />}
                  />
                </Stack>
              )}
        </Stack>
      </Card>
    </Page>
  )
}

function Sources({ view, here }: { view: Route.ComponentProps["loaderData"], here: string }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.import
  const templates = messages.admin.templates
  const refine = useRefine({ action: href(locale, here) })

  return (
    <Stack gap="block">
      {/* **Versions and drafts in one table**, the rows the research's own
          screen draws: as a source there is nothing to tell them apart by,
          and one row drawn two ways would read as two things. */}
      <Section title={t.rows}>
        <SourceTable rows={view.rows} here={here} current={view.draftId} humLabel={view.humLabel} locale={locale} />
      </Section>

      {view.application.allowed && (
        <Section
          title={t.application}
          note={view.humLabel === null ? t.applicationNoteUnlabelled : t.applicationNote(view.humLabel)}
        >
          {!view.application.connected
            ? <UpstreamNotConnected locale={locale} />
            : (
                <Stack gap="normal">
                  {/* **The table is narrowed, and the unnarrowed one is a way
                      away.** An application approved before its research ID
                      was given, or under another one, cannot be found by this
                      research's; it is looked up in the listing and its ID
                      pasted into the box below. */}
                  <div>
                    <ScreenLink to={href(locale, adminUpstreamResearchPath())} icon="inbox">
                      {templates.heading}
                    </ScreenLink>
                  </div>
                  {view.application.unknown !== null && <Note kind="warning">{templates.unknown(view.application.unknown)}</Note>}
                  <Form
                    method="get"
                    action={href(locale, here)}
                    onSubmit={refine}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <Field
                      label={t.unlinkedApplication}
                      name="application"
                      placeholder={templates.applicationPlaceholder}
                      width="w-64"
                    />
                    {/* **The word is what the press leads to**: an ID found
                        opens the same form a row's 取り込み opens. */}
                    <Submit variant="primary" icon={<Icon name="download" />}>{t.choose}</Submit>
                  </Form>
                  {/* **The columns are the listing's**, less the two every row
                      here would say alike (its research ID and whether that
                      research is here) — one branch drawn two ways would read
                      as two things. */}
                  <Table
                    actions
                    stuck={1}
                    headers={[
                      templates.application,
                      templates.approvedOn,
                      templates.title,
                      templates.pi,
                      templates.registered,
                    ]}
                    whenEmpty={templates.noBranches}
                  >
                    {view.application.branches.map((row) => (
                      <BranchRow key={row.applicationId} row={row} here={here} locale={locale} />
                    ))}
                  </Table>
                </Stack>
              )}
        </Section>
      )}
    </Stack>
  )
}

/** One of this research's own branches: what it registered, and the link to import it. */
function BranchRow({ row, here, locale }: {
  row: UpstreamBranchView
  here: string
  locale: Locale
}) {
  const messages = messagesFor(locale)
  return (
    <tr>
      <Td stuck={0} nowrap><BranchDialog applicationId={row.applicationId} locale={locale} /></Td>
      <BranchCells row={row} locale={locale} />
      <Td nowrap holds="control">
        <ButtonLink
          to={href(locale, here + upstreamQuery({ applicationId: row.applicationId }))}
          size="row"
          icon={<Icon name="download" />}
        >
          {messages.admin.import.choose}
        </ButtonLink>
      </Td>
    </tr>
  )
}
