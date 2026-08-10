import { apiSearch } from "~/api/pages.server"

import type { Route } from "./+types/api-research-list"

export function loader({ request }: Route.LoaderArgs) {
  return apiSearch(request, "research")
}
