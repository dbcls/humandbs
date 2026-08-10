import { PreviewResearchScreen } from "~/components/preview"
import { RESEARCH } from "~/review/anchors"
import { PREVIEW_HEADERS, previewAction, previewResearchPage } from "~/review/preview.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/preview"

/**
 * A draft as it will be published, opened by whoever holds the link.
 *
 * The address carries its own credential, which is why the response says not to
 * index it and not to send a referrer: a link followed out of this page must
 * not hand the token to the site at the other end. The token is checked where
 * the data is fetched rather than here, so nothing else can reach the draft by
 * asking a different way.
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
  return [
    { title: `${loaderData.humLabel ?? "draft"} - preview` },
    { name: "robots", content: "noindex, nofollow" },
  ]
}

export default function Preview({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PreviewResearchScreen
      view={loaderData}
      problem={actionData?.status === "invalid" ? actionData.problem : null}
    />
  )
}
