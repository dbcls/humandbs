import { researchVersionEntry } from "~/api/pages.server"

import type { Route } from "./+types/api-research-version"

export function loader({ request, params }: Route.LoaderArgs) {
  return researchVersionEntry(request, params.humId, params.version)
}
