import { data, Form } from "react-router"

import { upstreamBranchAction, upstreamBranchPage } from "~/admin/templates.server"
import { Heading, Note, Stack } from "~/components/base"
import { RadioGroup, Submit } from "~/components/form"
import { Card, Page, Section } from "~/components/page"
import { UpstreamChoice, UpstreamNotConnected } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-upstream-branch"

/**
 * One approval branch: what taking it in would bring, and where it can go.
 *
 * **The work is the same whichever is chosen** — the branch's values are
 * written into a draft. What the choice settles is which draft that is, and a
 * research that is already there gets a copy of its newest version to take the
 * branch into (docs/editing.md の「下書きを外から作る」).
 *
 * **A new research is the only choice that writes here.** It has nothing to be
 * put beside, so this screen is already the whole of the decision; the other
 * three go on to the screen where the two columns stand side by side.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamBranchPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await upstreamBranchAction(request, locale, params)
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    {
      title: `${loaderData.applicationId} - ${messages.admin.templates.heading}`
        + ` - ${messages.siteName}`,
    },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminUpstreamBranch({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const holder = view.holder
  const taken = holder?.drafts.some((draft) => draft.takenBranches.includes(view.applicationId))

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          {/* No way back of its own: the screen it came from is on the bar. */}
          <Heading title={view.applicationId} />
          {actionData?.status === "taken" && <Note kind="danger" live>{t.takenLabel}</Note>}

          {!view.connected || view.branch === null || view.chosen === null
            ? <UpstreamNotConnected locale={locale} dra={false} />
            : (
                <>
                  {view.branch.humLabel === null && (
                    <Note kind="warning">
                      {t.humLabelMissing}
                      {" "}
                      {t.humLabelMissingHint}
                    </Note>
                  )}
                  {taken === true && <Note kind="info">{t.takenAgain}</Note>}

                  {/*
                    The branch is read once and shown once. Where a research is
                    already there the datasets are ticked on the screen the
                    draft arrives at, so here they are only read.
                  */}
                  <Section title={view.branch.titleJa === "" ? view.branch.titleEn : view.branch.titleJa}>
                    {holder === null
                      ? (
                          <Form method="post">
                            <input type="hidden" name="into" value="new" />
                            <UpstreamChoice locale={locale} choice={view.chosen} submit={t.create} />
                          </Form>
                        )
                      : <UpstreamChoice locale={locale} choice={view.chosen} />}
                  </Section>

                  {holder !== null && (
                    <Section title={t.destination}>
                      <Form method="post">
                        <input type="hidden" name="research" value={holder.researchId} />
                        <Stack gap="normal">
                          <RadioGroup
                            label={t.destination}
                            name="into"
                            value={destinations(messages, holder)[0]?.value}
                            options={destinations(messages, holder)}
                          />
                          <div>
                            <Submit variant="primary">{t.go}</Submit>
                          </div>
                        </Stack>
                      </Form>
                    </Section>
                  )}
                </>
              )}
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * Where this branch can go, in the order a curator reads them: the version that
 * is out, the one that is not yet, then the drafts that are already open.
 */
function destinations(
  messages: ReturnType<typeof messagesFor>,
  holder: NonNullable<Route.ComponentProps["loaderData"]["holder"]>,
): { value: string, label: string }[] {
  const t = messages.admin.templates
  const detail = messages.admin.detail
  const latest = holder.latestNumber
  return [
    ...(latest === null
      ? []
      : [
          { value: "replacement", label: `${t.intoPublic(latest)} — ${t.intoPublicHint}` },
          { value: "next-version", label: `${t.intoNext(latest + 1)} — ${t.intoNextHint}` },
        ]),
    // A draft is told from its siblings by the note it carries, and by where it
    // was copied from when it carries none.
    ...holder.drafts.map((draft) => ({
      value: `draft:${draft.draftId}`,
      label: `${t.intoDraft} — ${draft.note === ""
        ? draft.copiedFromNumber === null
          ? detail.copiedFromNone
          : detail.copiedFrom(draft.copiedFromNumber)
        : draft.note} ${t.draftUpdatedAt(draft.updatedAt.slice(0, 10))}`,
    })),
  ]
}
