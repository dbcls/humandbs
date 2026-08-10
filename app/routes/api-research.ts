import { researchEntry } from "~/api/pages.server"

import type { Route } from "./+types/api-research"

export function loader({ request, params }: Route.LoaderArgs) {
  return researchEntry(request, params.humId, "latest")
}
