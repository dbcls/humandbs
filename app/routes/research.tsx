import { ResearchVersionPage } from "~/components/research"
import { readFilePage } from "~/files/listing.server"
import { researchPage } from "~/public/pages.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/research"

/** The latest published version. Which one that is comes from the published set. */
export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  const filePage = readFilePage(new URL(request.url))
  const view = await researchPage({ locale, humId: params.humId, wanted: "latest", filePage })
  return { locale, view }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.view.humLabel} - NBDC Human Database` }]
}

export default function Research({ loaderData }: Route.ComponentProps) {
  return <ResearchVersionPage view={loaderData.view} locale={loaderData.locale} />
}
