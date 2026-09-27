import { loadConfig, publicOrigin } from "~/config.server"
import { robotsText } from "~/public/crawl"

/** Written per deployment, so that it names this deployment's sitemap or turns crawlers away. */
export function loader() {
  const config = loadConfig(process.env)
  return new Response(robotsText({ origin: publicOrigin(config.auth), noindex: config.noindex }), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
