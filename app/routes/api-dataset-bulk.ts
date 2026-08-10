import { apiBulk } from "~/api/pages.server"

export function loader() {
  return apiBulk("dataset")
}
