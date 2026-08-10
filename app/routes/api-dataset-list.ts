import { apiSearch } from "~/api/pages.server"

import type { Route } from "./+types/api-dataset-list"

export function loader({ request }: Route.LoaderArgs) {
  return apiSearch(request, "dataset")
}
