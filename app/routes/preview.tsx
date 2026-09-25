import { PreviewResearchScreen } from "~/components/preview"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { RESEARCH } from "~/review/anchors"
import { PREVIEW_HEADERS, previewAction, previewResearchPage } from "~/review/preview.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/preview"

/**
 * A draft as it will be published, opened by whoever holds the link.
 *
 * The address has its own credential, which is why the response indicates not to
 * index it and not to send a referrer: a link followed out of this page must
 * not hand the token to the site at the other end. The token is checked where
 * the data is fetched rather than here, so nothing else can reach the draft by
 * requesting it a different way.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return previewResearchPage(request, locale, params.token)
}

export async function action({ request, params }: Route.ActionArgs) {
  return previewAction(request, params.token, RESEARCH)
}

export function headers() {
  return PREVIEW_HEADERS
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: windowTitle(messages, [loaderData.humLabel, messages.preview.heading]) },
    { name: "robots", content: "noindex, nofollow" },
  ]
}

export default function Preview({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PreviewResearchScreen view={loaderData} answer={actionData} />
  )
}
