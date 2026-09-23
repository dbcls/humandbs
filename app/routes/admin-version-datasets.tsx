import { versionDatasetListPage } from "~/admin/pages.server"
import { adminResearchPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Heading, Stack } from "~/components/base"
import { Card, ExternalLink, Page, Table, Td } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { datasetPath, href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-version-datasets"

/**
 * The datasets a published version lists, in its order — read and not written.
 *
 * A version is what a reader sees now, and nothing on it is edited in place
 * (docs/publishing.md): correcting one is done in the update draft the
 * version's "編集" opens, and that draft's own dataset screen is where the
 * list is changed. This screen answers the other question the research's
 * table raises — which ones are these — so that the count beside a version
 * is a way somewhere, as the count beside a draft is (docs/editing.md の
 * 「draft」).
 *
 * **Each id leads to the dataset's public page, in a new tab.** The reader is
 * here to work, and the page is what they are checking — the same way the
 * version's number on the research screen leads to its page.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return versionDatasetListPage(request, locale, params)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.draft.datasets, versionName(loaderData)) },
    { name: "robots", content: "noindex" },
  ]
}

/** Which one this is: the research's label and the version's number. */
function versionName({ humLabel, number }: { humLabel: string | null, number: number }): string {
  return humLabel === null ? `v${number}` : `${humLabel} v${number}`
}

export default function AdminVersionDatasets({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={messages.admin.draft.datasets} aside={versionName(view)}>
            <AdminBack
              to={href(locale, adminResearchPath(view.researchId))}
              label={messages.admin.editor.backToResearch}
              icon="chevron-left"
            />
          </Heading>
          {/* **The order is the public page's order.** The table stays when
              empty: the column name says what would stand here. */}
          <Table
            align="middle"
            headers={[messages.dataset.datasetId]}
            whenEmpty={messages.admin.detail.versionNoDatasets}
          >
            {view.rows.map((row) => (
              <tr key={row.id}>
                <Td nowrap>
                  {row.label === null
                    ? messages.admin.editor.unpinnedDataset
                    : (
                        <ExternalLink to={href(locale, datasetPath(row.label))} locale={locale}>
                          {row.label}
                        </ExternalLink>
                      )}
                </Td>
              </tr>
            ))}
          </Table>
        </Stack>
      </Card>
    </Page>
  )
}
