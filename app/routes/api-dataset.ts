import { datasetEntry } from "~/api/pages.server"

import type { Route } from "./+types/api-dataset"

export function loader({ request, params }: Route.LoaderArgs) {
  return datasetEntry(request, params.datasetId)
}
