import { DatasetPage } from "~/components/dataset"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { fileOrigin } from "~/public/file-lists.server"
import { datasetPage } from "~/public/pages.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/dataset"

export async function loader({ params, request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return { locale, view: await datasetPage({ locale, datasetId: params.datasetId }), origin: fileOrigin() }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: windowTitle(messages, [loaderData.view.label, messages.search.datasetList]) }]
}

export default function Dataset({ loaderData }: Route.ComponentProps) {
  return <DatasetPage view={loaderData.view} locale={loaderData.locale} origin={loaderData.origin} />
}
