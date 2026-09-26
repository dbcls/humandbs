import { data, Form } from "react-router"

import { upstreamBranchAction, upstreamBranchPage } from "~/admin/templates.server"
import type { UpstreamChoiceView } from "~/admin/templates.server"
import { adminResearchPath, adminUpstreamResearchPath } from "~/admin/urls"
import { AdminBack, ScreenLink } from "~/components/admin"
import { Heading, Note, Stack } from "~/components/base"
import { Answer, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Section } from "~/components/page"
import { Flag } from "~/components/flags"
import { APPLICATION_TYPE_FLAG, BranchDatasets, BranchPairs, DroppedNote, UpstreamNotConnected } from "~/components/upstream"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-upstream-branch"

/**
 * One approval branch: what it states, and either the start of a research from
 * it or — where the hum already identifies a research — the way there.
 *
 * **Two states only.** The hum is not in the portal, and the one thing to do
 * is start a research from what the branch states; or it already identifies one,
 * and this screen offers no form at all — importing the branch is done from
 * that research's own draft.
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

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.templates.branchHeading, loaderData.applicationId) },
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
      {/* Only a refusal is answered here: importing the branch leaves this
          screen for the draft it wrote into. */}
      <Answer
        answer={actionData}
        locale={locale}
        said={(answer) => answer.status === "taken" ? t.takenLabel : messages.admin.conflict}
      />
      <Card under={false}>
        <Stack gap="block">
          {/* The name shows what is done here and the branch is shown beside it —
              an application ID on its own would not say which screen this is.
              **Whether it is a new application or an update is a badge beside
              the ID**, as the listing's column shows it: the two are read
              differently from the first line on. */}
          <Heading
            title={t.branchHeading}
            aside={view.applicationId}
            badge={view.branch !== null && (
              <Flag kind={APPLICATION_TYPE_FLAG[view.branch.applicationType]}>
                {t.applicationTypes[view.branch.applicationType]}
              </Flag>
            )}
          >
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

                  {/* **The heading names what is being read; the branch shows
                      which one.** Standing the branch's own title where the
                      heading goes left the screen without a word for what it
                      holds — and the listing this screen is opened from names
                      six things about a branch where this named one. */}
                  <Section title={t.branchSummary}>
                    <BranchPairs locale={locale} branch={view.branch} fields={view.chosen.fields} />
                  </Section>

                  {/* What the application registered is part of what it shows,
                      read the same way whether a research is made from it
                      here or it already has one. */}
                  <BranchDatasets locale={locale} datasets={view.chosen.datasets} />

                  {holder === null
                    ? (
                        /* **Only a research that is not here yet is made here**,
                           in a section of its own that shows what the press
                           makes (`BranchCreate`). */
                        <Form method="post">
                          <input type="hidden" name="into" value="new" />
                          <BranchCreate
                            locale={locale}
                            choice={view.chosen}
                            submit={view.branch.humLabel === null ? t.createUnlabelled : t.createFor(view.branch.humLabel)}
                          />
                        </Form>
                      )
                    : (
                        /* **A research that is here already is only a way to
                           it.** Nothing is made on this screen then, so what
                           making would bring is not drawn; the import form of
                           one of its drafts draws it where it can be pressed.
                           **The link shows that it goes somewhere**, the bordered
                           style with the indicator after the word. */
                        <Section title={t.heldHeading} note={t.heldNote}>
                          <div>
                            <ScreenLink to={href(locale, adminResearchPath(holder.researchId))} icon="book">
                              {t.toResearchOf(view.branch.humLabel ?? "")}
                            </ScreenLink>
                          </div>
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
 * Starting a research from a branch: what the press makes, and the press.
 *
 * **A section of its own, under a name that shows what it is for** — the
 * sentence and the button are what the screen is opened to do, and standing
 * straight under the application's values they read as one more value.
 *
 * **Nothing is chosen.** Every dataset the branch registered belongs to the
 * research it describes, so all of them are made with it — they are read in
 * the application's own section above (`BranchDatasets`), where one a research
 * already holds is marked as such, and that one is left out because pinning it again
 * would refuse the whole creation. **What will not go in is said before the
 * press**, by the name the form gives its key.
 */
export function BranchCreate({ locale, choice, submit }: {
  locale: Locale
  choice: UpstreamChoiceView
  submit: string
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.templates

  return (
    <Section title={t.creating} note={t.createNote}>
      <Stack gap="normal">
        <DroppedNote locale={locale} dropped={choice.dropped} />
        <div>
          <Submit variant="primary" icon={<Icon name="plus" />}>{submit}</Submit>
        </div>
      </Stack>
    </Section>
  )
}
