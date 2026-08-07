import { data } from "react-router"

import { datasetEditorPage, saveDatasetAction } from "~/admin/pages.server"
import { DatasetEditor } from "~/components/dataset-editor"
import { messagesFor } from "~/i18n/messages"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-dataset"

/**
 * Writing one dataset of a draft, experiments and all.
 *
 * The unit of the save is the dataset's entry in the draft, so the answer
 * carries the status that entry deserves — 409 when its revision no longer
 * matches or when somebody else created it first, 422 when prose held markup
 * the tree cannot keep.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return datasetEditorPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const result = await saveDatasetAction(request, params)
  if (result.status === "invalid") return data(result, { status: 422 })
  if (result.status === "conflict") return data(result, { status: 409 })
  return result
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const label = loaderData.datasetLabel ?? messages.admin.editor.unpinnedDataset
  return [
    { title: `${label} - ${messages.admin.editor.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftDataset({ loaderData }: Route.ComponentProps) {
  return <DatasetEditor view={loaderData} />
}
