import { searchFields } from "~/api/pages.server"

export function loader() {
  return searchFields()
}
