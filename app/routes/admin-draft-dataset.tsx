import { data } from "react-router"

import { datasetEditorPage, datasetLabelAction, saveDatasetAction } from "~/admin/pages.server"
import { DatasetEditor } from "~/components/dataset-editor"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-dataset"

/**
 * Writing one dataset of a draft, experiments and all — and pinning its id.
 *
 * The unit of the save is the dataset's entry in the draft, so the answer
 * carries the status that entry deserves — 409 when its revision no longer
 * matches or when somebody else created it first, 422 when prose held markup
 * the tree cannot keep. **The id arrives as a form beside the JSON save**: it
 * is a ledger row rather than part of the description, and the two are told
 * apart by what the request is encoded as.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return datasetEditorPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    const answer = await datasetLabelAction(request, params)
    return data(answer, { status: answer.status === "taken" ? 409 : 200 })
  }
  const result = await saveDatasetAction(request, params)
  if (result.status === "conflict") return data(result, { status: 409 })
  return result
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  // The same name and identifier the head gives it (`components/dataset-editor.tsx`).
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.datasetEditor.heading, loaderData.datasetLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftDataset({ loaderData }: Route.ComponentProps) {
  return <DatasetEditor view={loaderData} />
}
