import { ResearchVersionPage } from "~/components/research"
import { readFilePage, readFileRows } from "~/files/listing.server"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { fileOrigin } from "~/public/file-lists.server"
import { researchPage } from "~/public/pages.server"
import { seoMeta } from "~/public/seo"
import { researchSeo } from "~/public/structured-data.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/research"

/** The latest published version. Which one that is comes from the published set. */
export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  const filePage = readFilePage(new URL(request.url))
  const fileRows = readFileRows(new URL(request.url))
  const view = await researchPage({ locale, humId: params.humId, wanted: "latest", filePage, fileRows })
  const origin = fileOrigin()
  return { locale, view, origin, seo: researchSeo(view, { origin, locale }) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return seoMeta(loaderData.seo, windowTitle(messages, [loaderData.view.humLabel, messages.search.researchList]), loaderData.locale)
}

export default function Research({ loaderData }: Route.ComponentProps) {
  return <ResearchVersionPage view={loaderData.view} locale={loaderData.locale} origin={loaderData.origin} />
}
