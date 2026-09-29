import { llmsText } from "~/api/overview"
import { loadConfig, publicOrigin } from "~/config.server"

/** Written per deployment, so that it names this deployment's addresses. */
export function loader() {
  return new Response(llmsText(publicOrigin(loadConfig(process.env).auth)), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  })
}
