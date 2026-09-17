import { data, Form } from "react-router"

import { upstreamDraftAction, upstreamDraftPage } from "~/admin/templates.server"
import { adminDraftPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Heading, Stack } from "~/components/base"
import { Answered, Result } from "~/components/form"
import { Card, Page, Section } from "~/components/page"
import { UpstreamMerge } from "~/components/upstream-merge"
import { UpstreamNotConnected } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-upstream"

/**
 * Taking an approved application into a draft that already exists.
 *
 * **A hum gains an approval branch every time its version goes up**, so the
 * second branch and the ones after it have to reach a research that is already
 * there. The screen that creates a research from an application cannot: the
 * ledger refuses a pin that is taken (docs/editing.md の「既存の下書きに
 * 取り込む」).
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

  return (
    <Page>
      {/* Only a refusal is answered: taking it in leaves for the draft. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "conflict" && <Result ok={false}>{t.conflict}</Result>}
        {actionData?.status === "taken" && <Result ok={false}>{t.takenLabel}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.headingDraft} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminDraftPath(view.researchId, view.draftId))}
              label={t.backToDraft}
              icon="chevron-left"
            />
          </Heading>
          {!view.connected || view.branch === null || view.merge === null
            ? <UpstreamNotConnected locale={locale} />
            : (
                <Section title={view.branch.applicationId}>
                  <Form method="post">
                    <input type="hidden" name="revision" value={view.revision} />
                    <input type="hidden" name="application" value={view.branch.applicationId} />
                    <UpstreamMerge locale={locale} view={view} />
                  </Form>
                </Section>
              )}
        </Stack>
      </Card>
    </Page>
  )
}
