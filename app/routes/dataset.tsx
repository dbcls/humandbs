import { DatasetPage } from "~/components/dataset"
import { datasetPage } from "~/public/pages.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/dataset"

export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return { locale, view: await datasetPage({ locale, datasetId: params.datasetId }) }
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.view.label} - NBDC Human Database` }]
}

export default function Dataset({ loaderData }: Route.ComponentProps) {
  return <DatasetPage view={loaderData.view} locale={loaderData.locale} />
}
