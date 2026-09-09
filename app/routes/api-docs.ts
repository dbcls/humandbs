import { docsPage } from "~/api/docs"

export function loader() {
  return docsPage()
}
