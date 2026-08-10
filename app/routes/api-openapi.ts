import { openapi } from "~/api/pages.server"

export function loader() {
  return openapi()
}
