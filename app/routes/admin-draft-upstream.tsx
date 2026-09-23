import { data, Form } from "react-router"

import type { UpstreamDraftBranchRow } from "~/admin/templates.server"
import { upstreamDraftAction, upstreamDraftPage } from "~/admin/templates.server"
import { adminDraftPath, adminDraftUpstreamPath, upstreamQuery } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Badge, ButtonLink, Clamped, Heading, Note, Stack } from "~/components/base"
import { Answered, Field, Result, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Code, ExternalLink, Page, Section, Table, Td } from "~/components/page"
import { UpstreamMerge } from "~/components/upstream-merge"
import { UpstreamNotConnected } from "~/components/upstream"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href, jgaEntryUrl, readLocale } from "~/public/urls"
import { useRefine } from "~/search-as-typed"

import type { Route } from "./+types/admin-draft-upstream"

/** How many registered datasets a row opens with before it counts the rest. */
const SHOWN_DATASETS = 3

/**
 * Taking an approved application into a draft that already exists.
 *
 * **Without an application chosen, this is a table of this research's own
 * branches** — newest approval first, each marked once this draft has taken
 * it in — plus the box to type an application ID that has not been given a
 * hum label yet (docs/editing.md の「行き先」). Choosing one, or looking one
 * up, turns the same screen into the three-column face that settles what
 * goes into the draft.
 *
 * **What arrives is not merged.** The draft and the application stand in two
 * read-only columns and the box under them is what gets written, because the
 * value a curator wants is often neither of the two.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamDraftPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await upstreamDraftAction(request, locale, params)
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.templates.headingDraft, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftUpstream({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const here = adminDraftUpstreamPath(view.researchId, view.draftId)
  const refine = useRefine({ action: href(locale, here) })

  return (
    <Page>
      {/* Only a refusal is answered: taking it in leaves for the draft. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "conflict" && <Result ok={false}>{t.conflict}</Result>}
        {actionData?.status === "taken" && <Result ok={false}>{t.takenLabel}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.headingDraft} aside={view.humLabel ?? undefined} note={t.headingDraftNote}>
            <AdminBack
              to={href(locale, adminDraftPath(view.researchId, view.draftId))}
              label={t.backToDraft}
              icon="chevron-left"
            />
          </Heading>

          {!view.connected
            ? <UpstreamNotConnected locale={locale} />
            : view.branch !== null && view.merge !== null
              ? (
                  <Section title={view.branch.applicationId}>
                    <Form method="post">
                      <input type="hidden" name="revision" value={view.revision} />
                      <input type="hidden" name="application" value={view.branch.applicationId} />
                      <UpstreamMerge locale={locale} view={view} />
                    </Form>
                  </Section>
                )
              : (
                  <Stack gap="block">
                    {view.unknown !== null && <Note kind="warning">{t.unknown(view.unknown)}</Note>}

                    <Section title={t.byApplication}>
                      <Form
                        method="get"
                        action={href(locale, here)}
                        onSubmit={refine}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <Field
                          label={t.application}
                          name="application"
                          value={view.applicationId ?? ""}
                          placeholder={t.applicationPlaceholder}
                          width="w-64"
                        />
                        <Submit variant="primary" icon={<Icon name="search" />}>{t.look}</Submit>
                      </Form>
                    </Section>

                    <Section title={t.branchesForHum}>
                      <Table
                        headers={[
                          t.application,
                          t.approvedOn,
                          t.registered,
                          t.takenColumn,
                          <span key="actions" className="sr-only">{messages.admin.actions}</span>,
                        ]}
                        whenEmpty={t.noBranches}
                      >
                        {view.branches.map((row) => (
                          <BranchRow
                            key={row.applicationId}
                            row={row}
                            researchId={view.researchId}
                            draftId={view.draftId}
                            locale={locale}
                          />
                        ))}
                      </Table>
                    </Section>
                  </Stack>
                )}
        </Stack>
      </Card>
    </Page>
  )
}

/** One of this research's own branches: what it registered, and the way to take it in. */
function BranchRow({ row, researchId, draftId, locale }: {
  row: UpstreamDraftBranchRow
  researchId: string
  draftId: string
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  return (
    <tr>
      <Td nowrap><Code>{row.applicationId}</Code></Td>
      <Td nowrap>{row.approvedOn ?? ""}</Td>
      <Td>
        <Clamped
          shown={SHOWN_DATASETS}
          more={(rest) => messages.search.andMore(rest)}
          less={messages.search.showLess}
          items={row.datasets.map((accession) => (
            <span key={accession} className="inline-flex items-center gap-1 align-top text-nowrap">
              <Icon name="database" aria-hidden="true" className="text-ink-muted" />
              <ExternalLink to={jgaEntryUrl(accession)} locale={locale}>{accession}</ExternalLink>
            </span>
          ))}
        />
      </Td>
      <Td>
        {row.taken && <Badge icon={<Icon name="check" aria-hidden="true" />}>{t.takenColumn}</Badge>}
      </Td>
      <Td nowrap holds="control">
        <ButtonLink
          to={href(locale, adminDraftUpstreamPath(researchId, draftId) + upstreamQuery({ applicationId: row.applicationId }))}
          size="row"
          icon={<Icon name="download" />}
        >
          {t.apply}
        </ButtonLink>
      </Td>
    </tr>
  )
}
