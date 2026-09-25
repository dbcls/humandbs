import { data } from "react-router"

import { draftEditorPage, saveDraftAction } from "~/admin/pages.server"
import { DraftEditor } from "~/components/editor"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft"

/**
 * Writing a research draft.
 *
 * The whole draft is saved in one request, because a version of a research is
 * one thing. The answer has the status the save deserves — 409 when the
 * revision no longer matches, 422 when prose held markup the tree cannot keep —
 * so what happened is visible in the exchange itself and not only in the body.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return draftEditorPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const result = await saveDraftAction(request, params)
  if (result.status === "conflict") return data(result, { status: 409 })
  return result
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  // The same name and identifier the header gives it (`components/editor.tsx`).
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.draft.heading, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraft({ loaderData }: Route.ComponentProps) {
  return <DraftEditor view={loaderData} />
}
