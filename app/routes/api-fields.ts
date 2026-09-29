import { searchFields } from "~/api/pages.server"

import type { Route } from "./+types/api-fields"

export function loader({ request }: Route.LoaderArgs) {
  return searchFields(request)
}
