import { data, Form, Link } from "react-router"

import { upstreamBranchAction, upstreamBranchPage } from "~/admin/templates.server"
import { adminResearchPath, adminUpstreamResearchPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Heading, Note, Stack, Chevron } from "~/components/base"
import { Answered, Result } from "~/components/form"
import { Card, Page, Section } from "~/components/page"
import { UpstreamChoice, UpstreamNotConnected } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-upstream-branch"

/**
 * One approval branch: what taking it in would bring, and — where the hum
 * already names a research — the way there.
 *
 * **Two states only.** The hum is not in the portal, and the one thing to do
 * is start a research from what the branch states; or it already names one,
 * and this screen offers no form at all — taking the branch in is done from
 * that research's own draft (docs/editing.md の「行き先」).
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
    { title: pageTitle(messages, messages.admin.templates.branchHeading, loaderData.applicationId) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminUpstreamBranch({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const holder = view.holder

  return (
    <Page>
      {/* Only a refusal is answered here: taking the branch in leaves this
          screen for the draft it wrote into. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "taken" && <Result ok={false}>{t.takenLabel}</Result>}
        {actionData?.status === "conflict" && <Result ok={false}>{t.conflict}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          {/* The name says what is done here and the branch stands beside it —
              an application ID on its own would not say which screen this is. */}
          <Heading title={t.branchHeading} aside={view.applicationId} note={t.branchHeadingNote}>
            <AdminBack
              to={href(locale, adminUpstreamResearchPath())}
              label={t.backToList}
              icon="chevron-left"
            />
          </Heading>

          {!view.connected || view.branch === null || view.chosen === null
            ? <UpstreamNotConnected locale={locale} />
            : (
                <>
                  {view.branch.humLabel === null && (
                    <Note kind="warning">
                      {t.humLabelMissing}
                      {" "}
                      {t.humLabelMissingHint}
                    </Note>
                  )}

                  {/*
                    The branch is read once and shown once. Where a research is
                    already there the datasets are ticked on the screen the
                    draft arrives at, so here they are only read.
                  */}
                  {/* **The heading names what is being read; the branch says
                      which one.** Standing the branch's own title where the
                      heading goes left the screen without a word for what it
                      holds — and the listing this screen is opened from names
                      six things about a branch where this named one. */}
                  <Section title={t.branchSummary}>
                    <Stack gap="normal">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                        <div className="contents">
                          <dt className="text-ink-muted">{t.humLabel}</dt>
                          <dd>{view.branch.humLabel ?? <span className="text-ink-muted">{t.noHumLabel}</span>}</dd>
                        </div>
                        <div className="contents">
                          <dt className="text-ink-muted">{t.approvedOn}</dt>
                          <dd>{view.branch.approvedOn ?? ""}</dd>
                        </div>
                        <div className="contents">
                          <dt className="text-ink-muted">{t.title}</dt>
                          <dd>
                            {view.branch.titleJa === "" ? view.branch.titleEn : view.branch.titleJa}
                          </dd>
                        </div>
                        <div className="contents">
                          <dt className="text-ink-muted">{t.pi}</dt>
                          <dd>{view.branch.piName}</dd>
                        </div>
                      </dl>

                      {holder === null
                        ? (
                            <Form method="post">
                              <input type="hidden" name="into" value="new" />
                              <UpstreamChoice locale={locale} choice={view.chosen} submit={t.create} />
                            </Form>
                          )
                        : (
                            <>
                              <UpstreamChoice locale={locale} choice={view.chosen} />
                              {/* **The way in is a link, and says it goes
                                  somewhere.** The one thing this state offers
                                  is the research it names, so it wears the
                                  face of a way there — the word and the mark
                                  after it (`docs/ui.md` の「押せるもの」) —
                                  rather than a button that reads as an
                                  operation done here. */}
                              <p className="flex flex-wrap items-center gap-3 text-sm">
                                <Link
                                  to={href(locale, adminResearchPath(holder.researchId))}
                                  className="group/way inline-flex items-center gap-1 font-semibold"
                                >
                                  {t.toResearch}
                                  <Chevron dir="right" />
                                </Link>
                                <span className="text-ink-muted">{t.takeFromResearch}</span>
                              </p>
                            </>
                          )}
                    </Stack>
                  </Section>
                </>
              )}
        </Stack>
      </Card>
    </Page>
  )
}
