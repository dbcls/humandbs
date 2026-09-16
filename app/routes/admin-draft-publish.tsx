import { data } from "react-router"

import { publishAction, publishPage } from "~/admin/pages.server"
import { PublishConfirmation } from "~/components/publish"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-publish"

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return publishPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await publishAction(request, locale, params)
  if (result instanceof Response) return result
  return data(result, { status: result.status === "conflict" ? 409 : 422 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.publish.heading, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftPublish({ loaderData, actionData }: Route.ComponentProps) {
  return <PublishConfirmation view={loaderData} result={actionData ?? null} />
}
