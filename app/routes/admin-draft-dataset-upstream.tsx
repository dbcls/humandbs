import { data, Form } from "react-router"

import { upstreamDatasetAction, upstreamDatasetPage } from "~/admin/templates.server"
import { adminDraftDatasetsPath, adminUpstreamDatasetPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Heading, Note, Stack } from "~/components/base"
import { Answered, Field, Result, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Section } from "~/components/page"
import { UpstreamChoice } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"
import { useRefine } from "~/search-as-typed"

import type { Route } from "./+types/admin-draft-dataset-upstream"

/**
 * Adding a dataset to a draft by the accession an archive already holds — a
 * JGAD, found through the application it was registered under, or a DRA
 * submission, which the application system does not hold at all.
 *
 * **An application is not chosen here.** Taking a branch's datasets goes through
 * the listing of branches, opened aimed at this draft (docs/editing.md の
 * 「行き先」); a second place to choose a branch would be a second listing of
 * them.
 *
 * **The research's own description is not touched.** Bringing upstream's newer
 * wording into a draft somebody is writing is the three-way take-up, which the
 * editing screen already has; this only adds datasets.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamDatasetPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await upstreamDatasetAction(request, locale, params)
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.templates.headingDataset, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftDatasetUpstream({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const here = adminUpstreamDatasetPath(view.researchId, view.draftId)
  const refine = useRefine({ action: href(locale, here) })

  return (
    <Page>
      {/* Only a refusal is answered: a dataset that was made comes back as the
          list it was added to. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "taken" && <Result ok={false}>{t.takenLabel}</Result>}
        {actionData?.status === "conflict" && <Result ok={false}>{t.conflict}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.headingDataset} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminDraftDatasetsPath(view.researchId, view.draftId))}
              label={t.backToDatasets}
              icon="chevron-left"
            />
          </Heading>

          {view.unknown !== null && <Note kind="warning">{t.unknown(view.unknown)}</Note>}

          <Section title={t.byAccession}>
            <Form
              method="get"
              action={href(locale, here)}
              onSubmit={refine}
              className="flex flex-wrap items-end gap-3"
            >
              {/* **The example is the box's grey word rather than a line under
                  it.** A line under the box makes the field taller than the
                  button beside it, and a row aligned at its foot then stands
                  the button level with the line instead of with the box. */}
              <Field
                label={t.accessionHint}
                name="accession"
                value={view.accession}
                placeholder={t.accessionPlaceholder}
                width="w-64"
              />
              <Submit variant="primary" icon={<Icon name="search" />}>{t.look}</Submit>
            </Form>
          </Section>

          {view.chosen !== null && (
            <Section title={view.chosen.applicationId ?? view.accession}>
              <Form method="post">
                <input type="hidden" name="revision" value={view.revision} />
                {view.chosen.applicationId !== null && (
                  <input type="hidden" name="application" value={view.chosen.applicationId} />
                )}
                <UpstreamChoice locale={locale} choice={view.chosen} submit={t.add} />
              </Form>
            </Section>
          )}
        </Stack>
      </Card>
    </Page>
  )
}
