import { PreviewDatasetScreen } from "~/components/preview"
import { PREVIEW_HEADERS, previewAction, previewDatasetPage } from "~/review/preview.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/preview-dataset"

/**
 * One dataset of a draft, addressed by identity: a dataset the draft has just
 * made has no id pinned yet, and the whole point of the link is to ask about
 * what is not settled.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return previewDatasetPage(request, locale, params.token, params.datasetId)
}

export async function action({ request, params }: Route.ActionArgs) {
  return previewAction(request, params.token, { kind: "dataset", datasetId: params.datasetId })
}

export function headers() {
  return PREVIEW_HEADERS
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData.datasetLabel ?? "dataset"} - preview` },
    { name: "robots", content: "noindex, nofollow" },
  ]
}

export default function PreviewDataset({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PreviewDatasetScreen
      view={loaderData}
      problem={actionData?.status === "invalid" ? actionData.problem : null}
    />
  )
}
