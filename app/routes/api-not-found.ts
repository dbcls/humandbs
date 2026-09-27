import { problemResponse } from "~/api/http"
import { noSuchEndpoint } from "~/api/problem"

import type { Route } from "./+types/api-not-found"

export function loader({ request }: Route.LoaderArgs) {
  return problemResponse(noSuchEndpoint(request))
}
