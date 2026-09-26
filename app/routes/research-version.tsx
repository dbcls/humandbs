import { ResearchVersionPage } from "~/components/research"
import { readFilePage, readFileRows } from "~/files/listing.server"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { fileOrigin } from "~/public/file-lists.server"
import { researchPage } from "~/public/pages.server"
import { parseVersionSegment, readLocale } from "~/public/urls"

import type { Route } from "./+types/research-version"

export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  const wanted = parseVersionSegment(params.version)
  // Anything else in this position is not an address of a version, including
  // `v01` — one version has one address.
  if (wanted === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  const filePage = readFilePage(new URL(request.url))
  const fileRows = readFileRows(new URL(request.url))
  const view = await researchPage({ locale, humId: params.humId, wanted, filePage, fileRows })
  return { locale, view, origin: fileOrigin() }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const { view } = loaderData
  return [{ title: windowTitle(messages, [view.versionLabel, view.humLabel, messages.search.researchList]) }]
}

export default function ResearchVersion({ loaderData }: Route.ComponentProps) {
  return <ResearchVersionPage view={loaderData.view} locale={loaderData.locale} origin={loaderData.origin} numbered />
}
